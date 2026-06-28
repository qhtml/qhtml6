#pragma once

#include "qdom_components.hpp"

#include <QtCore/QHash>
#include <QtCore/QSet>
#include <QtCore/QString>
#include <QtCore/QStringList>
#include <QtCore/QVariant>
#include <QtCore/QVector>

#include <functional>
#include <utility>

namespace qhtml::wasm {

class QDomParserCursor {
public:
    explicit QDomParserCursor(QString source = {})
        : source_(std::move(source))
    {
    }

    [[nodiscard]] bool atEnd() const { return index_ >= source_.size(); }
    [[nodiscard]] qsizetype index() const { return index_; }
    [[nodiscard]] const QString &source() const { return source_; }

    [[nodiscard]] QChar peek(qsizetype offset = 0) const
    {
        const qsizetype pos = index_ + offset;
        return pos >= 0 && pos < source_.size() ? source_.at(pos) : QChar();
    }

    QChar take()
    {
        return atEnd() ? QChar() : source_.at(index_++);
    }

    void skipWhitespace()
    {
        while (!atEnd() && peek().isSpace()) {
            ++index_;
        }
    }

    void skipSeparators()
    {
        while (!atEnd() && (peek().isSpace() || peek() == QLatin1Char(';'))) {
            ++index_;
        }
    }

    [[nodiscard]] QString readHead()
    {
        const qsizetype start = index_;
        bool inQuote = false;
        QChar quote;
        int parenDepth = 0;
        int bracketDepth = 0;

        while (!atEnd()) {
            const QChar ch = peek();
            if (inQuote) {
                if (ch == quote && (index_ == 0 || source_.at(index_ - 1) != QLatin1Char('\\'))) {
                    inQuote = false;
                }
                ++index_;
                continue;
            }
            if (ch == QLatin1Char('"') || ch == QLatin1Char('\'')) {
                inQuote = true;
                quote = ch;
                ++index_;
                continue;
            }
            if (ch == QLatin1Char('(')) {
                ++parenDepth;
                ++index_;
                continue;
            }
            if (ch == QLatin1Char(')')) {
                parenDepth = qMax(0, parenDepth - 1);
                ++index_;
                continue;
            }
            if (ch == QLatin1Char('[')) {
                ++bracketDepth;
                ++index_;
                continue;
            }
            if (ch == QLatin1Char(']')) {
                bracketDepth = qMax(0, bracketDepth - 1);
                ++index_;
                continue;
            }
            if (parenDepth == 0 && bracketDepth == 0 &&
                (ch == QLatin1Char('{') || ch == QLatin1Char('\n') || ch == QLatin1Char(';'))) {
                break;
            }
            ++index_;
        }
        return source_.mid(start, index_ - start).trimmed();
    }

    [[nodiscard]] QString readBalancedBlock()
    {
        skipWhitespace();
        if (peek() != QLatin1Char('{')) {
            return {};
        }

        take();
        const qsizetype start = index_;
        int depth = 1;
        bool inQuote = false;
        QChar quote;

        while (!atEnd() && depth > 0) {
            const QChar ch = take();
            if (inQuote) {
                if (ch == quote && (index_ < 2 || source_.at(index_ - 2) != QLatin1Char('\\'))) {
                    inQuote = false;
                }
                continue;
            }
            if (ch == QLatin1Char('"') || ch == QLatin1Char('\'')) {
                inQuote = true;
                quote = ch;
                continue;
            }
            if (ch == QLatin1Char('{')) {
                ++depth;
            } else if (ch == QLatin1Char('}')) {
                --depth;
            }
        }

        const qsizetype end = depth == 0 ? index_ - 1 : index_;
        return source_.mid(start, end - start);
    }

    void consumeLineEnd()
    {
        while (!atEnd() && peek() != QLatin1Char('\n') && peek() != QLatin1Char(';')) {
            ++index_;
        }
        while (!atEnd() && (peek() == QLatin1Char('\n') || peek() == QLatin1Char(';'))) {
            ++index_;
        }
    }

private:
    QString source_;
    qsizetype index_ = 0;
};

class QDomParser {
public:
    using ResourceImportResolver = std::function<QString(const QString &)>;

    QDomParser() = default;

    void setResourceImportResolver(ResourceImportResolver resolver)
    {
        resourceImportResolver_ = std::move(resolver);
    }

    QDomDocument parse(const QString &source)
    {
        reset();
        QDomDocument document;
        document.meta.uuid = nextUuid(QStringLiteral("document"));
        document.meta.source = source;
        document.nodes = parseNodes(source, nullptr, &document);
        return document;
    }

    QDomDocumentNode parseNodeTree(const QString &source)
    {
        reset();
        QDomDocumentNode document;
        document.meta.uuid = nextUuid(QStringLiteral("document"));
        document.meta.source = source;
        document.nodes = parseNodes(source, nullptr, nullptr);
        return document;
    }

private:
    struct HeadParts {
        QString keyword;
        QString name;
        QString parameters;
        QStringList tokens;
    };

    void reset()
    {
        uuidCounter_ = 0;
        componentDefinitions_.clear();
        templateDefinitions_.clear();
        structDefinitions_.clear();
        classDefinitions_.clear();
    }

    QVector<QDomNodePtr> parseNodes(const QString &source, QDomNode *owner, QDomDocument *document)
    {
        QVector<QDomNodePtr> nodes;
        QDomParserCursor cursor(source);
        while (!cursor.atEnd()) {
            cursor.skipSeparators();
            if (cursor.atEnd()) {
                break;
            }

            const QString head = cursor.readHead();
            if (head.isEmpty()) {
                cursor.consumeLineEnd();
                continue;
            }

            cursor.skipWhitespace();
            if (cursor.peek() == QLatin1Char('{')) {
                const QString body = cursor.readBalancedBlock();
                handleBlock(head, body, owner, document, nodes);
            } else {
                handleLine(head, owner, document, nodes);
                cursor.consumeLineEnd();
            }
        }
        return nodes;
    }

    void handleBlock(
        const QString &head,
        const QString &body,
        QDomNode *owner,
        QDomDocument *document,
        QVector<QDomNodePtr> &nodes)
    {
        const HeadParts parts = splitHead(head);
        const QString keyword = parts.keyword.toLower();

        if (keyword == QLatin1String("text") || keyword == QLatin1String("innertext")) {
            auto node = QSharedPointer<QDomTextNode>::create();
            initNode(node.data(), QStringLiteral("text"));
            node->value = body;
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("html")) {
            auto node = QSharedPointer<QDomRawHtmlNode>::create();
            initNode(node.data(), QStringLiteral("html"));
            node->html = body;
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("style") && owner) {
            auto node = QSharedPointer<QDomRawHtmlNode>::create();
            initNode(node.data(), QStringLiteral("style"));
            node->html = QStringLiteral("<style>") + body + QStringLiteral("</style>");
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("q-component") || keyword == QLatin1String("q-template") ||
            keyword == QLatin1String("q-worker")) {
            auto node = parseComponentDefinition(parts, body);
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("q-class")) {
            auto node = parseClassDefinition(parts, body);
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("q-struct")) {
            auto node = parseStructDefinition(parts, body);
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("q-model") || keyword == QLatin1String("q-array") ||
            keyword == QLatin1String("q-map") || keyword == QLatin1String("q-object")) {
            auto node = parseModel(parts, body);
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("q-repeater") || keyword == QLatin1String("q-foreach") ||
            keyword == QLatin1String("q-model-view")) {
            auto node = parseRepeater(parts, body);
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("q-style")) {
            if (document) {
                document->styleDefinitions.append(parseStyle(parts, body));
            }
            return;
        }

        if (keyword == QLatin1String("q-theme") || keyword == QLatin1String("q-default-theme")) {
            if (document) {
                document->themeDefinitions.append(parseTheme(parts, body));
            }
            return;
        }

        if (keyword == QLatin1String("q-connect")) {
            const QDomConnectionDefinition connection = parseConnection(body);
            if (document) {
                document->connectionDefinitions.append(connection);
            } else if (owner) {
                owner->meta.lifecycleScriptNames.append(QStringLiteral("q-connect"));
            }
            return;
        }

        if (keyword == QLatin1String("q-import-resource")) {
            appendResourceImport(body, owner, document, nodes);
            return;
        }

        if (keyword == QLatin1String("q-color") || keyword == QLatin1String("q-color-schema") ||
            keyword == QLatin1String("q-color-theme")) {
            auto node = QSharedPointer<QDomColorNode>::create();
            initNode(node.data(), keyword);
            node->name = parts.name;
            node->value = body.trimmed();
            nodes.append(node);
            return;
        }

        if (keyword == QLatin1String("slot")) {
            auto node = QSharedPointer<QDomSlotNode>::create();
            initNode(node.data(), QStringLiteral("slot"));
            node->name = slotName(parts, body);
            node->children = parseNodes(body, node.data(), document);
            nodes.append(node);
            return;
        }

        if (isScriptKeyword(keyword)) {
            auto node = QSharedPointer<QDomScriptRuleNode>::create();
            initNode(node.data(), keyword);
            node->name = parts.keyword;
            node->parameters = parts.parameters;
            node->body = body;
            node->isLifecycle = isLifecycleKeyword(keyword);
            node->isConnection = keyword == QLatin1String("q-connect");
            nodes.append(node);
            return;
        }

        if (componentDefinitions_.contains(parts.keyword)) {
            auto node = parseComponentInstance(parts, body);
            nodes.append(node);
            return;
        }

        if (templateDefinitions_.contains(parts.keyword)) {
            auto node = parseTemplateInstance(parts, body);
            nodes.append(node);
            return;
        }

        if (structDefinitions_.contains(parts.keyword)) {
            auto node = parseStructInstance(parts, body);
            nodes.append(node);
            return;
        }

        if (classDefinitions_.contains(parts.keyword)) {
            auto node = parseClassInstance(parts, body);
            nodes.append(node);
            return;
        }

        QVector<QDomNodePtr> elementNodes = parseElementChain(head, body, document);
        for (const auto &node : elementNodes) {
            nodes.append(node);
        }
    }

    void handleLine(
        const QString &line,
        QDomNode *owner,
        QDomDocument *document,
        QVector<QDomNodePtr> &nodes)
    {
        const QString trimmed = line.trimmed();
        if (trimmed.isEmpty()) {
            return;
        }

        if (trimmed.startsWith(QStringLiteral("q-property "))) {
            applyPropertyDefinition(owner, trimmed.mid(QStringLiteral("q-property ").size()), {});
            return;
        }

        if (trimmed.startsWith(QStringLiteral("property "))) {
            applyPropertyDefinition(owner, trimmed.mid(QStringLiteral("property ").size()), {});
            return;
        }

        if (trimmed.startsWith(QStringLiteral("q-signal "))) {
            applySignal(owner, trimmed.mid(QStringLiteral("q-signal ").size()));
            return;
        }

        const qsizetype colon = trimmed.indexOf(QLatin1Char(':'));
        if (colon > 0 && owner) {
            applyAssignment(owner, trimmed.left(colon).trimmed(), trimmed.mid(colon + 1).trimmed());
            return;
        }

        if (trimmed.startsWith(QStringLiteral("q-import-resource "))) {
            appendResourceImport(trimmed.mid(QStringLiteral("q-import-resource ").size()), owner, document, nodes);
            return;
        }

        auto node = QSharedPointer<QDomTextNode>::create();
        initNode(node.data(), QStringLiteral("line"));
        node->value = trimmed;
        nodes.append(node);
    }

    void appendResourceImport(
        const QString &body,
        QDomNode *owner,
        QDomDocument *document,
        QVector<QDomNodePtr> &nodes)
    {
        if (!resourceImportResolver_) {
            QDomLifecycleScript script;
            script.name = QStringLiteral("q-import-resource");
            script.body = body;
            if (document) {
                document->lifecycleScripts.append(script);
            } else if (owner) {
                owner->meta.lifecycleScriptNames.append(script.name);
            }
            return;
        }

        const QString imported = resourceImportResolver_(body);
        if (imported.trimmed().isEmpty()) {
            return;
        }

        const QVector<QDomNodePtr> importedNodes = parseNodes(imported, owner, document);
        for (const auto &node : importedNodes) {
            nodes.append(node);
        }
    }

    QSharedPointer<QDomComponentDefinitionNode> parseComponentDefinition(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomComponentDefinitionNode>::create();
        initNode(node.data(), parts.keyword);
        node->componentId = parts.name;
        node->definitionType = parts.keyword.toLower() == QLatin1String("q-template")
            ? QStringLiteral("template")
            : parts.keyword.toLower() == QLatin1String("q-worker")
                ? QStringLiteral("worker")
                : QStringLiteral("component");
        node->extendsComponentIds = parseExtends(parts.tokens);
        node->extendsComponentId = node->extendsComponentIds.isEmpty() ? QString() : node->extendsComponentIds.first();

        if (node->definitionType == QLatin1String("template")) {
            templateDefinitions_.insert(node->componentId);
        } else {
            componentDefinitions_.insert(node->componentId);
        }

        QVector<QDomNodePtr> bodyNodes;
        parseComponentBody(body, node.data(), bodyNodes);
        node->templateNodes = bodyNodes;
        return node;
    }

    QSharedPointer<QDomClassDefinitionNode> parseClassDefinition(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomClassDefinitionNode>::create();
        initNode(node.data(), parts.keyword);
        node->classId = parts.name;
        node->extendsClassId = parseExtends(parts.tokens).value(0);
        classDefinitions_.insert(node->classId);

        parseClassBody(body, node.data());
        return node;
    }

    QSharedPointer<QDomStructDefinitionNode> parseStructDefinition(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomStructDefinitionNode>::create();
        initNode(node.data(), parts.keyword);
        node->structId = parts.name;
        structDefinitions_.insert(node->structId);

        QDomParserCursor cursor(body);
        while (!cursor.atEnd()) {
            cursor.skipSeparators();
            const QString head = cursor.readHead();
            if (head.isEmpty()) {
                cursor.consumeLineEnd();
                continue;
            }
            cursor.skipWhitespace();
            QString value;
            if (cursor.peek() == QLatin1Char('{')) {
                value = cursor.readBalancedBlock().trimmed();
            } else {
                const qsizetype colon = head.indexOf(QLatin1Char(':'));
                if (colon > 0) {
                    value = head.mid(colon + 1).trimmed();
                }
                cursor.consumeLineEnd();
            }
            const QString name = head.section(QLatin1Char(':'), 0, 0).trimmed();
            if (!name.isEmpty()) {
                QDomPropertyDefinition field;
                field.name = name;
                field.defaultValue = parseScalar(value);
                field.uuid = nextUuid(QStringLiteral("field"));
                node->fields.append(field);
            }
        }
        return node;
    }

    QSharedPointer<QDomModelNode> parseModel(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomModelNode>::create();
        initNode(node.data(), parts.keyword);
        node->name = parts.name;
        node->source = body.trimmed();
        node->alias = parts.tokens.value(2);
        return node;
    }

    QSharedPointer<QDomRepeaterNode> parseRepeater(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomRepeaterNode>::create();
        initNode(node.data(), parts.keyword);
        node->repeaterId = parts.name;
        node->modelRef = parts.tokens.value(2);
        node->alias = parts.tokens.value(3);
        node->templateNodes = parseNodes(body, node.data(), nullptr);
        return node;
    }

    QSharedPointer<QDomComponentInstanceNode> parseComponentInstance(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomComponentInstanceNode>::create();
        initNode(node.data(), parts.keyword);
        node->componentId = parts.keyword;
        node->tagName = parts.keyword;
        node->meta.instanceAlias = parts.name;
        parseInstanceBody(body, node.data(), node->children);
        return node;
    }

    QSharedPointer<QDomTemplateInstanceNode> parseTemplateInstance(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomTemplateInstanceNode>::create();
        initNode(node.data(), parts.keyword);
        node->templateId = parts.keyword;
        node->tagName = parts.keyword;
        node->meta.instanceAlias = parts.name;
        parseInstanceBody(body, node.data(), node->children);
        return node;
    }

    QSharedPointer<QDomStructInstanceNode> parseStructInstance(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomStructInstanceNode>::create();
        initNode(node.data(), parts.keyword);
        node->structId = parts.keyword;
        node->alias = parts.name;
        parseStructInstanceBody(body, node.data());
        return node;
    }

    QSharedPointer<QDomClassInstanceNode> parseClassInstance(const HeadParts &parts, const QString &body)
    {
        auto node = QSharedPointer<QDomClassInstanceNode>::create();
        initNode(node.data(), parts.keyword);
        node->classId = parts.keyword;
        node->alias = parts.name;
        node->argumentSource = parts.parameters;
        node->children = parseNodes(body, node.data(), nullptr);
        return node;
    }

    void parseComponentBody(const QString &body, QDomComponentDefinitionNode *owner, QVector<QDomNodePtr> &templateNodes)
    {
        QDomParserCursor cursor(body);
        while (!cursor.atEnd()) {
            cursor.skipSeparators();
            const QString head = cursor.readHead();
            if (head.isEmpty()) {
                cursor.consumeLineEnd();
                continue;
            }
            cursor.skipWhitespace();
            const bool hasBlock = cursor.peek() == QLatin1Char('{');
            const QString nested = hasBlock ? cursor.readBalancedBlock() : QString();
            const HeadParts parts = splitHead(head);
            const QString keyword = parts.keyword.toLower();

            if (keyword == QLatin1String("q-property") || keyword == QLatin1String("property")) {
                applyPropertyDefinition(owner, head.mid(parts.keyword.size()).trimmed(), nested);
            } else if (keyword == QLatin1String("q-signal")) {
                applySignal(owner, head.mid(parts.keyword.size()).trimmed());
            } else if (keyword == QLatin1String("function")) {
                applyMethod(owner, parts, nested);
            } else if (keyword == QLatin1String("constructor")) {
                applyMethod(owner, parts, nested);
            } else if (keyword == QLatin1String("q-callback")) {
                QDomCallbackDeclaration callback;
                callback.name = parts.name;
                callback.parameters = splitParameters(parts.parameters);
                callback.signature = parts.name + QLatin1Char('(') + parts.parameters + QLatin1Char(')');
                callback.body = nested;
                owner->callbackDeclarations.append(callback);
            } else if (keyword == QLatin1String("q-alias")) {
                QDomAliasDeclaration alias;
                alias.name = parts.name;
                alias.target = nested.trimmed();
                owner->aliasDeclarations.append(alias);
            } else if (keyword == QLatin1String("q-var")) {
                QDomVarDeclaration varDecl;
                varDecl.name = parts.name;
                varDecl.value = parseScalar(nested.trimmed());
                owner->varDeclarations.append(varDecl);
            } else if (keyword == QLatin1String("q-switch")) {
                QDomSwitchDeclaration switchDecl;
                switchDecl.name = parts.name;
                switchDecl.meta.source = nested;
                owner->switchDeclarations.append(switchDecl);
            } else if (keyword == QLatin1String("q-timer")) {
                QDomTimerDefinition timer;
                timer.name = parts.name;
                timer.body = nested;
                owner->qTimerDefinitions.append(timer);
            } else if (keyword == QLatin1String("slot")) {
                QDomSlotDefault slotDefault;
                slotDefault.name = slotName(parts, nested);
                slotDefault.nodes = parseNodes(nested, owner, nullptr);
                owner->slotDefaults.append(slotDefault);
            } else if (isLifecycleKeyword(keyword) || keyword == QLatin1String("q-connect")) {
                QDomLifecycleScript script;
                script.name = parts.keyword;
                script.body = nested;
                script.isQConnect = keyword == QLatin1String("q-connect");
                owner->lifecycleScripts.append(script);
            } else if (hasBlock) {
                handleBlock(head, nested, owner, nullptr, templateNodes);
            } else {
                handleLine(head, owner, nullptr, templateNodes);
                cursor.consumeLineEnd();
            }
        }
    }

    void parseClassBody(const QString &body, QDomClassDefinitionNode *owner)
    {
        QDomParserCursor cursor(body);
        while (!cursor.atEnd()) {
            cursor.skipSeparators();
            const QString head = cursor.readHead();
            if (head.isEmpty()) {
                cursor.consumeLineEnd();
                continue;
            }
            cursor.skipWhitespace();
            const bool hasBlock = cursor.peek() == QLatin1Char('{');
            const QString nested = hasBlock ? cursor.readBalancedBlock() : QString();
            const HeadParts parts = splitHead(head);
            const QString keyword = parts.keyword.toLower();

            if (keyword == QLatin1String("q-property") || keyword == QLatin1String("property")) {
                applyPropertyDefinition(owner, head.mid(parts.keyword.size()).trimmed(), nested);
            } else if (keyword == QLatin1String("q-signal")) {
                applySignal(owner, head.mid(parts.keyword.size()).trimmed());
            } else if (keyword == QLatin1String("constructor") || keyword == QLatin1String("function")) {
                applyMethod(owner, parts, nested);
            } else if (keyword == QLatin1String("q-callback")) {
                QDomCallbackDeclaration callback;
                callback.name = parts.name;
                callback.parameters = splitParameters(parts.parameters);
                callback.signature = parts.name + QLatin1Char('(') + parts.parameters + QLatin1Char(')');
                callback.body = nested;
                owner->callbackDeclarations.append(callback);
            } else if (keyword == QLatin1String("q-alias")) {
                QDomAliasDeclaration alias;
                alias.name = parts.name;
                alias.target = nested.trimmed();
                owner->aliasDeclarations.append(alias);
            } else if (keyword == QLatin1String("q-var")) {
                QDomVarDeclaration varDecl;
                varDecl.name = parts.name;
                varDecl.value = parseScalar(nested.trimmed());
                owner->varDeclarations.append(varDecl);
            } else if (keyword == QLatin1String("q-switch")) {
                QDomSwitchDeclaration switchDecl;
                switchDecl.name = parts.name;
                switchDecl.meta.source = nested;
                owner->switchDeclarations.append(switchDecl);
            } else if (keyword == QLatin1String("q-timer")) {
                QDomTimerDefinition timer;
                timer.name = parts.name;
                timer.body = nested;
                owner->qTimerDefinitions.append(timer);
            } else if (keyword == QLatin1String("slot")) {
                QDomSlotDefault slotDefault;
                slotDefault.name = slotName(parts, nested);
                slotDefault.nodes = parseNodes(nested, owner, nullptr);
                owner->slotDefaults.append(slotDefault);
            } else if (isLifecycleKeyword(keyword) || keyword == QLatin1String("q-connect")) {
                QDomLifecycleScript script;
                script.name = parts.keyword;
                script.body = nested;
                script.isQConnect = keyword == QLatin1String("q-connect");
                owner->lifecycleScripts.append(script);
            } else if (hasBlock) {
                QVector<QDomNodePtr> ignored;
                handleBlock(head, nested, owner, nullptr, ignored);
            } else {
                QVector<QDomNodePtr> ignored;
                handleLine(head, owner, nullptr, ignored);
                cursor.consumeLineEnd();
            }
        }
    }

    void parseInstanceBody(const QString &body, QDomNode *owner, QVector<QDomNodePtr> &children)
    {
        QDomParserCursor cursor(body);
        while (!cursor.atEnd()) {
            cursor.skipSeparators();
            const QString head = cursor.readHead();
            if (head.isEmpty()) {
                cursor.consumeLineEnd();
                continue;
            }
            cursor.skipWhitespace();
            if (cursor.peek() == QLatin1Char('{')) {
                const QString nested = cursor.readBalancedBlock();
                const HeadParts parts = splitHead(head);
                handleBlock(head, nested, owner, nullptr, children);
            } else {
                handleLine(head, owner, nullptr, children);
                cursor.consumeLineEnd();
            }
        }
    }

    void parseStructInstanceBody(const QString &body, QDomStructInstanceNode *owner)
    {
        QDomParserCursor cursor(body);
        while (!cursor.atEnd()) {
            cursor.skipSeparators();
            const QString head = cursor.readHead();
            if (head.isEmpty()) {
                cursor.consumeLineEnd();
                continue;
            }
            cursor.skipWhitespace();
            QString value;
            if (cursor.peek() == QLatin1Char('{')) {
                value = cursor.readBalancedBlock().trimmed();
            } else {
                const qsizetype colon = head.indexOf(QLatin1Char(':'));
                if (colon > 0) {
                    value = head.mid(colon + 1).trimmed();
                }
                cursor.consumeLineEnd();
            }
            const QString name = head.section(QLatin1Char(':'), 0, 0).trimmed();
            if (!name.isEmpty()) {
                owner->fields.insert(name, parseScalar(value));
            }
        }
    }

    QVector<QDomNodePtr> parseElementChain(const QString &head, const QString &body, QDomDocument *document)
    {
        const QStringList selectors = splitCommaAware(head);
        QVector<QDomNodePtr> roots;
        QSharedPointer<QDomElementNode> previous;
        for (const QString &selector : selectors) {
            auto element = QSharedPointer<QDomElementNode>::create();
            initNode(element.data(), selector.trimmed());
            element->tagName = tagNameFromSelector(selector);
            element->selectorChain = {selector.trimmed()};
            applySelectorAttributes(element.data(), selector);
            if (previous) {
                previous->children.append(element);
            } else {
                roots.append(element);
            }
            previous = element;
        }
        if (previous) {
            previous->children.append(parseNodes(body, previous.data(), document));
        }
        return roots;
    }

    void applyAssignment(QDomNode *owner, const QString &name, const QString &rawValue)
    {
        const QVariant value = parseScalar(rawValue);
        owner->properties.insert(name, value);
        if (auto *element = dynamic_cast<QDomElementNode *>(owner)) {
            element->attributes.insert(name, value.toString());
        } else if (auto *component = dynamic_cast<QDomComponentDefinitionNode *>(owner)) {
            component->attributes.insert(name, value.toString());
        } else if (auto *componentInstance = dynamic_cast<QDomComponentInstanceNode *>(owner)) {
            componentInstance->props.insert(name, value);
        } else if (auto *templateInstance = dynamic_cast<QDomTemplateInstanceNode *>(owner)) {
            templateInstance->props.insert(name, value);
        } else if (auto *classInstance = dynamic_cast<QDomClassInstanceNode *>(owner)) {
            classInstance->props.insert(name, value);
        }
    }

    void applyPropertyDefinition(QDomNode *owner, const QString &raw, const QString &block)
    {
        if (!owner) {
            return;
        }
        const qsizetype colon = raw.indexOf(QLatin1Char(':'));
        const QString name = (colon >= 0 ? raw.left(colon) : raw).trimmed();
        const QString value = colon >= 0 ? raw.mid(colon + 1).trimmed() : block.trimmed();
        if (name.isEmpty()) {
            return;
        }
        QDomPropertyDefinition property;
        property.name = name;
        property.defaultValue = parseScalar(value);
        property.uuid = nextUuid(QStringLiteral("property"));
        if (auto *component = dynamic_cast<QDomComponentDefinitionNode *>(owner)) {
            component->propertyDefinitions.append(property);
            component->properties.append(name);
            component->attributes.insert(name, property.defaultValue.toString());
        } else if (auto *klass = dynamic_cast<QDomClassDefinitionNode *>(owner)) {
            klass->propertyDefinitions.append(property);
            klass->properties.insert(name, property.defaultValue);
        } else {
            owner->properties.insert(name, property.defaultValue);
        }
    }

    void applySignal(QDomNode *owner, const QString &raw)
    {
        if (!owner) {
            return;
        }
        const HeadParts signal = splitCallable(raw.trimmed());
        QDomSignalDeclaration declaration;
        declaration.name = signal.keyword;
        declaration.parameters = splitParameters(signal.parameters);
        declaration.signature = signal.keyword + QLatin1Char('(') + signal.parameters + QLatin1Char(')');
        declaration.uuid = nextUuid(QStringLiteral("signal"));
        owner->signalDeclarations.append(declaration);
        if (auto *component = dynamic_cast<QDomComponentDefinitionNode *>(owner)) {
            component->signalDeclarations.append(declaration);
        }
    }

    void applyMethod(QDomNode *owner, const HeadParts &parts, const QString &body)
    {
        if (!owner) {
            return;
        }
        QDomMethodDefinition method;
        method.name = parts.name;
        method.parameters = parts.parameters;
        method.signature = parts.name + QLatin1Char('(') + parts.parameters + QLatin1Char(')');
        method.body = body;
        owner->methods.append(method);
        if (auto *component = dynamic_cast<QDomComponentDefinitionNode *>(owner)) {
            component->methods.append(method);
        } else if (auto *klass = dynamic_cast<QDomClassDefinitionNode *>(owner)) {
            if (parts.keyword.toLower() == QLatin1String("constructor")) {
                klass->constructorSignature = method.signature;
                klass->constructorParameters = method.parameters;
                klass->constructorBody = method.body;
            }
        }
    }

    QDomConnectionDefinition parseConnection(const QString &body)
    {
        const QStringList parts = body.simplified().split(QLatin1Char(' '), Qt::SkipEmptyParts);
        QDomConnectionDefinition connection;
        if (parts.size() >= 2) {
            const QStringList sender = parts.at(0).split(QLatin1Char('.'));
            const QStringList target = parts.at(1).split(QLatin1Char('.'));
            connection.senderAlias = sender.value(0);
            connection.signalName = sender.value(1);
            connection.targetAlias = target.value(0);
            connection.methodName = target.value(1);
        }
        connection.source = body;
        connection.meta.uuid = nextUuid(QStringLiteral("connection"));
        return connection;
    }

    QDomStyleDefinition parseStyle(const HeadParts &parts, const QString &body)
    {
        QDomStyleDefinition style;
        style.name = parts.name;
        style.meta.uuid = nextUuid(QStringLiteral("style"));
        for (const QString &line : body.split(QLatin1Char('\n'))) {
            const qsizetype colon = line.indexOf(QLatin1Char(':'));
            if (colon > 0) {
                style.declarations.insert(line.left(colon).trimmed(), line.mid(colon + 1).trimmed());
            }
        }
        return style;
    }

    QDomThemeDefinition parseTheme(const HeadParts &parts, const QString &body)
    {
        QDomThemeDefinition theme;
        theme.name = parts.name;
        theme.meta.uuid = nextUuid(QStringLiteral("theme"));
        theme.meta.source = body;
        return theme;
    }

    HeadParts splitHead(const QString &head) const
    {
        HeadParts parts;
        parts.tokens = head.simplified().split(QLatin1Char(' '), Qt::SkipEmptyParts);
        parts.keyword = parts.tokens.value(0);
        if (parts.tokens.size() > 1) {
            parts.name = parts.tokens.value(1);
        }
        if (parts.keyword == QLatin1String("function") || parts.keyword == QLatin1String("constructor")) {
            return splitFunctionHead(head);
        }
        return parts;
    }

    HeadParts splitCallable(const QString &value) const
    {
        HeadParts parts;
        const qsizetype open = value.indexOf(QLatin1Char('('));
        const qsizetype close = value.lastIndexOf(QLatin1Char(')'));
        if (open >= 0 && close > open) {
            parts.keyword = value.left(open).trimmed();
            parts.parameters = value.mid(open + 1, close - open - 1).trimmed();
        } else {
            parts.keyword = value.trimmed();
        }
        parts.name = parts.keyword;
        return parts;
    }

    HeadParts splitFunctionHead(const QString &head) const
    {
        const QString rest = head.mid(head.indexOf(QLatin1Char(' ')) + 1).trimmed();
        HeadParts callable = splitCallable(rest);
        callable.keyword = head.section(QLatin1Char(' '), 0, 0).trimmed();
        callable.name = splitCallable(rest).name;
        callable.tokens = head.simplified().split(QLatin1Char(' '), Qt::SkipEmptyParts);
        return callable;
    }

    QStringList parseExtends(const QStringList &tokens) const
    {
        QStringList out;
        for (int i = 0; i < tokens.size(); ++i) {
            if (tokens.at(i).toLower() == QLatin1String("extends") && i + 1 < tokens.size()) {
                out.append(tokens.at(i + 1));
            }
        }
        return out;
    }

    QStringList splitParameters(const QString &parameters) const
    {
        QStringList out;
        for (const QString &part : parameters.split(QLatin1Char(','), Qt::SkipEmptyParts)) {
            out.append(part.trimmed());
        }
        return out;
    }

    QString slotName(const HeadParts &parts, const QString &body) const
    {
        if (!parts.name.isEmpty()) {
            return parts.name;
        }
        return body.simplified().section(QLatin1Char(' '), 0, 0).trimmed();
    }

    QString tagNameFromSelector(const QString &selector) const
    {
        QString tag = selector.trimmed();
        const qsizetype idIndex = tag.indexOf(QLatin1Char('#'));
        const qsizetype classIndex = tag.indexOf(QLatin1Char('.'));
        qsizetype end = tag.size();
        if (idIndex >= 0) {
            end = qMin(end, idIndex);
        }
        if (classIndex >= 0) {
            end = qMin(end, classIndex);
        }
        tag = tag.left(end).trimmed();
        return tag.isEmpty() ? QStringLiteral("div") : tag;
    }

    void applySelectorAttributes(QDomElementNode *element, const QString &selector) const
    {
        const QString text = selector.trimmed();
        const qsizetype idIndex = text.indexOf(QLatin1Char('#'));
        if (idIndex >= 0) {
            qsizetype end = text.indexOf(QLatin1Char('.'), idIndex);
            if (end < 0) {
                end = text.size();
            }
            const QString id = text.mid(idIndex + 1, end - idIndex - 1).trimmed();
            if (!id.isEmpty()) {
                element->attributes.insert(QStringLiteral("id"), id);
            }
        }

        QStringList classes;
        qsizetype classIndex = text.indexOf(QLatin1Char('.'));
        while (classIndex >= 0) {
            qsizetype end = text.indexOf(QLatin1Char('.'), classIndex + 1);
            if (end < 0) {
                end = text.size();
            }
            const QString className = text.mid(classIndex + 1, end - classIndex - 1).trimmed();
            if (!className.isEmpty()) {
                classes.append(className);
            }
            classIndex = text.indexOf(QLatin1Char('.'), end);
        }
        if (!classes.isEmpty()) {
            element->attributes.insert(QStringLiteral("class"), classes.join(QLatin1Char(' ')));
        }
    }

    QStringList splitCommaAware(const QString &source) const
    {
        QStringList out;
        QString current;
        bool inQuote = false;
        QChar quote;
        int parenDepth = 0;
        for (const QChar ch : source) {
            if (inQuote) {
                current.append(ch);
                if (ch == quote) {
                    inQuote = false;
                }
                continue;
            }
            if (ch == QLatin1Char('"') || ch == QLatin1Char('\'')) {
                inQuote = true;
                quote = ch;
                current.append(ch);
                continue;
            }
            if (ch == QLatin1Char('(')) {
                ++parenDepth;
            } else if (ch == QLatin1Char(')')) {
                parenDepth = qMax(0, parenDepth - 1);
            }
            if (ch == QLatin1Char(',') && parenDepth == 0) {
                if (!current.trimmed().isEmpty()) {
                    out.append(current.trimmed());
                }
                current.clear();
            } else {
                current.append(ch);
            }
        }
        if (!current.trimmed().isEmpty()) {
            out.append(current.trimmed());
        }
        return out;
    }

    QVariant parseScalar(QString value) const
    {
        value = value.trimmed();
        if ((value.startsWith(QLatin1Char('"')) && value.endsWith(QLatin1Char('"'))) ||
            (value.startsWith(QLatin1Char('\'')) && value.endsWith(QLatin1Char('\'')))) {
            return value.mid(1, value.size() - 2);
        }
        if (value.compare(QStringLiteral("true"), Qt::CaseInsensitive) == 0) {
            return true;
        }
        if (value.compare(QStringLiteral("false"), Qt::CaseInsensitive) == 0) {
            return false;
        }
        bool ok = false;
        const double number = value.toDouble(&ok);
        if (ok) {
            return number;
        }
        return value;
    }

    bool isLifecycleKeyword(const QString &keyword) const
    {
        return keyword == QLatin1String("onready") ||
            keyword == QLatin1String("onload") ||
            keyword == QLatin1String("onloaded");
    }

    bool isScriptKeyword(const QString &keyword) const
    {
        return isLifecycleKeyword(keyword) ||
            keyword == QLatin1String("q-script") ||
            keyword == QLatin1String("q-bind") ||
            keyword == QLatin1String("onclick") ||
            keyword.startsWith(QStringLiteral("on"));
    }

    void initNode(QDomNode *node, const QString &source)
    {
        node->meta.uuid = nextUuid(QStringLiteral("node"));
        node->meta.source = source;
        node->selectorChain = source.isEmpty() ? QStringList{} : QStringList{source};
    }

    QString nextUuid(const QString &prefix)
    {
        ++uuidCounter_;
        return QStringLiteral("qdom-") + prefix + QLatin1Char('-') + QString::number(uuidCounter_);
    }

    int uuidCounter_ = 0;
    QSet<QString> componentDefinitions_;
    QSet<QString> templateDefinitions_;
    QSet<QString> structDefinitions_;
    QSet<QString> classDefinitions_;
    ResourceImportResolver resourceImportResolver_;
};

} // namespace qhtml::wasm
