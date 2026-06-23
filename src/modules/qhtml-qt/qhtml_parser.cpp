// qhtml_parser.cpp
// QtCore-only symbolic parser for QHTML source.

#include "qhtml_parser.h"

#include <QJsonDocument>
#include <QJsonObject>
#include <QRegularExpression>
#include <QSet>
#include <QUuid>
#include <QtGlobal>

#include <limits>

namespace {

QString lowerTrimmed(const QString &input)
{
    return input.trimmed().toLower();
}

QVariantMap mapOf(std::initializer_list<std::pair<QString, QVariant>> values)
{
    QVariantMap out;
    for (const auto &entry : values) {
        out.insert(entry.first, entry.second);
    }
    return out;
}

QStringList splitParameters(const QString &source)
{
    QStringList out;
    int depth = 0;
    QChar quote;
    QString current;

    for (int i = 0; i < source.size(); ++i) {
        const QChar ch = source.at(i);
        if (!quote.isNull()) {
            current.append(ch);
            if (ch == QLatin1Char('\\') && i + 1 < source.size()) {
                current.append(source.at(++i));
                continue;
            }
            if (ch == quote) {
                quote = QChar();
            }
            continue;
        }
        if (ch == QLatin1Char('"') || ch == QLatin1Char('\'') || ch == QLatin1Char('`')) {
            quote = ch;
            current.append(ch);
            continue;
        }
        if (ch == QLatin1Char('(') || ch == QLatin1Char('[') || ch == QLatin1Char('{')) {
            ++depth;
        } else if (ch == QLatin1Char(')') || ch == QLatin1Char(']') || ch == QLatin1Char('}')) {
            depth = qMax(0, depth - 1);
        }
        if (ch == QLatin1Char(',') && depth == 0) {
            const QString item = current.trimmed();
            if (!item.isEmpty()) {
                out.append(item);
            }
            current.clear();
            continue;
        }
        current.append(ch);
    }

    const QString item = current.trimmed();
    if (!item.isEmpty()) {
        out.append(item);
    }
    return out;
}

QVariant valueFromRaw(const QString &rawValue)
{
    const QString value = rawValue.trimmed();
    if (value.isEmpty()) {
        return QString();
    }
    if ((value.startsWith(QLatin1Char('"')) && value.endsWith(QLatin1Char('"'))) ||
        (value.startsWith(QLatin1Char('\'')) && value.endsWith(QLatin1Char('\'')))) {
        QString inner = value.mid(1, value.size() - 2);
        inner.replace(QStringLiteral("\\n"), QStringLiteral("\n"));
        inner.replace(QStringLiteral("\\r"), QStringLiteral("\r"));
        inner.replace(QStringLiteral("\\t"), QStringLiteral("\t"));
        inner.replace(QStringLiteral("\\\""), QStringLiteral("\""));
        inner.replace(QStringLiteral("\\'"), QStringLiteral("'"));
        inner.replace(QStringLiteral("\\\\"), QStringLiteral("\\"));
        return inner;
    }
    if (value.compare(QStringLiteral("true"), Qt::CaseInsensitive) == 0) {
        return true;
    }
    if (value.compare(QStringLiteral("false"), Qt::CaseInsensitive) == 0) {
        return false;
    }
    if (value.compare(QStringLiteral("null"), Qt::CaseInsensitive) == 0) {
        return QVariant();
    }
    bool okInt = false;
    const qlonglong intValue = value.toLongLong(&okInt, 10);
    if (okInt) {
        return intValue;
    }
    bool okDouble = false;
    const double doubleValue = value.toDouble(&okDouble);
    if (okDouble) {
        return doubleValue;
    }
    return value;
}

class SymbolicParser
{
public:
    explicit SymbolicParser(const QString &source)
        : m_source(source), m_length(source.size())
    {
    }

    QVariantMap parseDocument()
    {
        QVariantList body = parseItems(QChar());
        return mapOf({
            {QStringLiteral("type"), QStringLiteral("QHtmlDocument")},
            {QStringLiteral("source"), m_source},
            {QStringLiteral("body"), body},
        });
    }

private:
    QString m_source;
    int m_index = 0;
    int m_length = 0;

    bool eof() const { return m_index >= m_length; }

    QChar peek(int offset = 0) const
    {
        const int pos = m_index + offset;
        return pos >= 0 && pos < m_length ? m_source.at(pos) : QChar();
    }

    QChar consume()
    {
        return eof() ? QChar() : m_source.at(m_index++);
    }

    bool isIdentifierStart(QChar ch) const
    {
        return ch.isLetter() || ch == QLatin1Char('_');
    }

    bool isIdentifierChar(QChar ch) const
    {
        return ch.isLetterOrNumber() ||
            ch == QLatin1Char('_') ||
            ch == QLatin1Char('-') ||
            ch == QLatin1Char('.') ||
            ch == QLatin1Char('#');
    }

    void skipWhitespace()
    {
        while (!eof()) {
            const QChar ch = peek();
            if (ch.isSpace() || ch == QLatin1Char(';')) {
                ++m_index;
                continue;
            }
            if (ch == QLatin1Char('/') && peek(1) == QLatin1Char('/')) {
                m_index += 2;
                while (!eof() && peek() != QLatin1Char('\n') && peek() != QLatin1Char('\r')) {
                    ++m_index;
                }
                continue;
            }
            if (ch == QLatin1Char('/') && peek(1) == QLatin1Char('*')) {
                m_index += 2;
                while (!eof() && !(peek() == QLatin1Char('*') && peek(1) == QLatin1Char('/'))) {
                    ++m_index;
                }
                if (!eof()) {
                    m_index += 2;
                }
                continue;
            }
            break;
        }
    }

    QString parseIdentifier()
    {
        skipWhitespace();
        const int start = m_index;
        while (!eof() && isIdentifierChar(peek())) {
            ++m_index;
        }
        return m_source.mid(start, m_index - start);
    }

    QString parseReferenceIdentifier()
    {
        skipWhitespace();
        const int start = m_index;
        if (!isIdentifierStart(peek())) {
            return QString();
        }
        ++m_index;
        while (!eof() && (peek().isLetterOrNumber() || peek() == QLatin1Char('_'))) {
            ++m_index;
        }
        return m_source.mid(start, m_index - start);
    }

    QString parseTypeIdentifier()
    {
        skipWhitespace();
        const int start = m_index;
        while (!eof() && isIdentifierChar(peek())) {
            ++m_index;
        }
        return m_source.mid(start, m_index - start);
    }

    QString readBalanced(QChar open, QChar close)
    {
        QString out;
        int depth = 1;
        QChar quote;

        while (!eof()) {
            const QChar ch = consume();
            if (!quote.isNull()) {
                out.append(ch);
                if (ch == QLatin1Char('\\') && !eof()) {
                    out.append(consume());
                    continue;
                }
                if (ch == quote) {
                    quote = QChar();
                }
                continue;
            }
            if (ch == QLatin1Char('"') || ch == QLatin1Char('\'') || ch == QLatin1Char('`')) {
                quote = ch;
                out.append(ch);
                continue;
            }
            if (ch == QLatin1Char('/') && peek() == QLatin1Char('/')) {
                out.append(ch);
                while (!eof()) {
                    const QChar comment = consume();
                    out.append(comment);
                    if (comment == QLatin1Char('\n') || comment == QLatin1Char('\r')) {
                        break;
                    }
                }
                continue;
            }
            if (ch == QLatin1Char('/') && peek() == QLatin1Char('*')) {
                out.append(ch);
                out.append(consume());
                while (!eof()) {
                    const QChar comment = consume();
                    out.append(comment);
                    if (comment == QLatin1Char('*') && peek() == QLatin1Char('/')) {
                        out.append(consume());
                        break;
                    }
                }
                continue;
            }
            if (ch == open) {
                ++depth;
            } else if (ch == close) {
                --depth;
                if (depth == 0) {
                    return out;
                }
            }
            out.append(ch);
        }
        return out;
    }

    QString parseBareValue()
    {
        const int start = m_index;
        QChar quote;
        int parenDepth = 0;
        int bracketDepth = 0;
        int braceDepth = 0;
        while (!eof()) {
            const QChar ch = peek();
            if (!quote.isNull()) {
                ++m_index;
                if (ch == QLatin1Char('\\') && !eof()) {
                    ++m_index;
                    continue;
                }
                if (ch == quote) {
                    quote = QChar();
                }
                continue;
            }
            if (ch == QLatin1Char('"') || ch == QLatin1Char('\'') || ch == QLatin1Char('`')) {
                quote = ch;
                ++m_index;
                continue;
            }
            if (ch == QLatin1Char('(')) {
                ++parenDepth;
            } else if (ch == QLatin1Char(')')) {
                parenDepth = qMax(0, parenDepth - 1);
            } else if (ch == QLatin1Char('[')) {
                ++bracketDepth;
            } else if (ch == QLatin1Char(']')) {
                bracketDepth = qMax(0, bracketDepth - 1);
            } else if (ch == QLatin1Char('{')) {
                ++braceDepth;
            } else if (ch == QLatin1Char('}')) {
                if (parenDepth == 0 && bracketDepth == 0 && braceDepth == 0) {
                    break;
                }
                braceDepth = qMax(0, braceDepth - 1);
            }
            if ((ch == QLatin1Char('\n') || ch == QLatin1Char('\r') || ch == QLatin1Char(';')) &&
                parenDepth == 0 && bracketDepth == 0 && braceDepth == 0) {
                break;
            }
            ++m_index;
        }
        return m_source.mid(start, m_index - start).trimmed();
    }

    QVariantMap withCommon(QVariantMap item, int start, int end) const
    {
        item.insert(QStringLiteral("start"), start);
        item.insert(QStringLiteral("end"), end);
        item.insert(QStringLiteral("raw"), m_source.mid(start, end - start));
        return item;
    }

    QVariantList parseItems(QChar stop)
    {
        QVariantList items;
        while (!eof()) {
            skipWhitespace();
            if (!stop.isNull() && peek() == stop) {
                break;
            }
            if (eof()) {
                break;
            }
            if (!isIdentifierStart(peek())) {
                const int start = m_index;
                QString text;
                while (!eof()) {
                    if (!stop.isNull() && peek() == stop) {
                        break;
                    }
                    if (isIdentifierStart(peek())) {
                        break;
                    }
                    text.append(consume());
                }
                const QString trimmed = text.trimmed();
                if (!trimmed.isEmpty()) {
                    items.append(withCommon(mapOf({
                        {QStringLiteral("type"), QStringLiteral("TextBlock")},
                        {QStringLiteral("text"), trimmed},
                    }), start, m_index));
                }
                continue;
            }
            items.append(parseItem());
        }
        return items;
    }

    QVariantMap parseItem()
    {
        const int start = m_index;
        const QString name = parseIdentifier();
        const QString nameLower = name.toLower();
        skipWhitespace();

        if (nameLower == QLatin1String("q-class") && peek() != QLatin1Char('{')) {
            return parseQClassDefinition(start);
        }

        if (nameLower == QLatin1String("function")) {
            return parseFunctionBlock(start);
        }

        if (nameLower == QLatin1String("q-signal") && peek() != QLatin1Char('{')) {
            return parseSignal(start);
        }

        if (nameLower == QLatin1String("q-callback") && peek() != QLatin1Char('{')) {
            return parseCallback(start);
        }

        if (nameLower == QLatin1String("q-property") && peek() != QLatin1Char('{')) {
            return parseQPropertyDeclaration(start);
        }

        if (nameLower == QLatin1String("behavior")) {
            return parseBehaviorBlock(start);
        }

        if (nameLower == QLatin1String("q-var") && peek() != QLatin1Char('{')) {
            return parseNamedBody(start, QStringLiteral("QVarDeclaration"), QStringLiteral("name"));
        }

        if (nameLower == QLatin1String("q-array") && peek() != QLatin1Char('{')) {
            return parseNamedRawBody(start, QStringLiteral("QArrayDefinition"), QStringLiteral("name"), QStringLiteral("body"));
        }

        if (nameLower == QLatin1String("q-style") && peek() != QLatin1Char('{')) {
            return parseNamedRawBody(start, QStringLiteral("QStyleDefinition"), QStringLiteral("name"), QStringLiteral("body"));
        }

        if (nameLower == QLatin1String("q-theme") && peek() != QLatin1Char('{')) {
            return parseNamedRawBody(start, QStringLiteral("QThemeDefinition"), QStringLiteral("name"), QStringLiteral("body"));
        }

        if (nameLower == QLatin1String("q-default-theme") && peek() != QLatin1Char('{')) {
            return parseNamedRawBody(start, QStringLiteral("QDefaultThemeDefinition"), QStringLiteral("name"), QStringLiteral("body"));
        }

        if (nameLower == QLatin1String("q-transition") && peek() != QLatin1Char('{')) {
            return parseNamedRawBody(start, QStringLiteral("QTransitionDefinition"), QStringLiteral("name"), QStringLiteral("body"));
        }

        if (nameLower == QLatin1String("q-painter") && peek() != QLatin1Char('{')) {
            return parseNamedRawBody(start, QStringLiteral("QPainterDefinition"), QStringLiteral("name"), QStringLiteral("body"));
        }

        if ((nameLower == QLatin1String("q-object") || nameLower == QLatin1String("q-map")) && peek() != QLatin1Char('{')) {
            QVariantMap item = parseNamedBlock(start, QStringLiteral("QObjectDefinition"), QStringLiteral("name"));
            item.insert(QStringLiteral("keyword"), nameLower == QLatin1String("q-map") ? QStringLiteral("q-map") : QStringLiteral("q-object"));
            return item;
        }

        if (nameLower == QLatin1String("q-component") ||
            nameLower == QLatin1String("q-template") ||
            nameLower == QLatin1String("q-worker") ||
            nameLower == QLatin1String("q-macro") ||
            nameLower == QLatin1String("q-rewrite")) {
            return parseNamedBlock(start, keywordType(nameLower), QStringLiteral("name"));
        }

        if (isEventName(nameLower) && (peek() == QLatin1Char('{') || peek() == QLatin1Char('('))) {
            return parseEventBlock(start, name);
        }

        if (peek() == QLatin1Char('(') && nameLower != QLatin1String("qhtml")) {
            return parseNamedFunctionBlock(start, name);
        }

        if (peek() == QLatin1Char(':')) {
            consume();
            const QString rawValue = parseBareValue();
            return withCommon(mapOf({
                {QStringLiteral("type"), QStringLiteral("Property")},
                {QStringLiteral("name"), name},
                {QStringLiteral("rawValue"), rawValue},
                {QStringLiteral("value"), valueFromRaw(rawValue)},
            }), start, m_index);
        }

        if (isIdentifierStart(peek())) {
            const int aliasStart = m_index;
            const QString alias = parseReferenceIdentifier();
            skipWhitespace();
            QString args;
            if (peek() == QLatin1Char('(')) {
                consume();
                args = readBalanced(QLatin1Char('('), QLatin1Char(')'));
                skipWhitespace();
            }
            if (peek() == QLatin1Char('{')) {
                consume();
                QVariantList children = parseItems(QLatin1Char('}'));
                if (peek() == QLatin1Char('}')) {
                    consume();
                }
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("Element")},
                    {QStringLiteral("selectors"), QStringList({name})},
                    {QStringLiteral("instanceAlias"), alias.trimmed()},
                    {QStringLiteral("instanceArguments"), args.trimmed()},
                    {QStringLiteral("argumentList"), splitParameters(args)},
                    {QStringLiteral("items"), children},
                }), start, m_index);
            }
            m_index = aliasStart;
            skipWhitespace();
        }

        if (peek() == QLatin1Char(',')) {
            const QStringList selectors = parseSelectorList(name);
            skipWhitespace();
            QVariantList children;
            if (peek() == QLatin1Char('{')) {
                consume();
                children = parseItems(QLatin1Char('}'));
                if (peek() == QLatin1Char('}')) {
                    consume();
                }
            }
            return withCommon(mapOf({
                {QStringLiteral("type"), QStringLiteral("Element")},
                {QStringLiteral("selectors"), selectors},
                {QStringLiteral("items"), children},
            }), start, m_index);
        }

        if (peek() == QLatin1Char('{')) {
            consume();
            if (nameLower == QLatin1String("text") || nameLower == QLatin1String("innertext")) {
                const QString text = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("TextBlock")},
                    {QStringLiteral("text"), text},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("html")) {
                const QString html = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("HtmlBlock")},
                    {QStringLiteral("html"), html},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("style")) {
                const QString css = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("StyleBlock")},
                    {QStringLiteral("css"), css},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("q-script") || nameLower == QLatin1String("q-script-action")) {
                const QString script = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
                return withCommon(mapOf({
                    {QStringLiteral("type"), nameLower == QLatin1String("q-script") ? QStringLiteral("QScriptInline") : QStringLiteral("QScriptActionBlock")},
                    {QStringLiteral("script"), script},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("q-import")) {
                const QString path = readBalanced(QLatin1Char('{'), QLatin1Char('}')).trimmed();
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("ImportBlock")},
                    {QStringLiteral("path"), path},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("q-property")) {
                const QString body = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("QPropertyBlock")},
                    {QStringLiteral("properties"), splitParameters(body.simplified().replace(QLatin1Char(' '), QLatin1Char(',')))},
                    {QStringLiteral("body"), body},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("q-wasm")) {
                const QString body = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("QWasmBlock")},
                    {QStringLiteral("config"), QHtmlParser::parseQWasmConfig(body)},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("q-array")) {
                const QString body = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("QArrayDefinition")},
                    {QStringLiteral("name"), QString()},
                    {QStringLiteral("body"), body},
                }), start, m_index);
            }
            if (nameLower == QLatin1String("q-object") || nameLower == QLatin1String("q-map")) {
                QVariantList children = parseItems(QLatin1Char('}'));
                if (peek() == QLatin1Char('}')) {
                    consume();
                }
                return withCommon(mapOf({
                    {QStringLiteral("type"), QStringLiteral("QObjectDefinition")},
                    {QStringLiteral("name"), QString()},
                    {QStringLiteral("keyword"), nameLower == QLatin1String("q-map") ? QStringLiteral("q-map") : QStringLiteral("q-object")},
                    {QStringLiteral("items"), children},
                }), start, m_index);
            }

            QVariantList children = parseItems(QLatin1Char('}'));
            if (peek() == QLatin1Char('}')) {
                consume();
            }
            return withCommon(mapOf({
                {QStringLiteral("type"), QStringLiteral("Element")},
                {QStringLiteral("selectors"), QStringList({name})},
                {QStringLiteral("items"), children},
            }), start, m_index);
        }

        const QString rest = parseBareValue();
        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("RawTextLine")},
            {QStringLiteral("text"), (name + QLatin1Char(' ') + rest).trimmed()},
        }), start, m_index);
    }

    QString keywordType(const QString &keyword) const
    {
        if (keyword == QLatin1String("q-template")) {
            return QStringLiteral("TemplateDefinition");
        }
        if (keyword == QLatin1String("q-worker")) {
            return QStringLiteral("WorkerDefinition");
        }
        if (keyword == QLatin1String("q-macro")) {
            return QStringLiteral("MacroDefinition");
        }
        if (keyword == QLatin1String("q-rewrite")) {
            return QStringLiteral("RewriteDefinition");
        }
        return QStringLiteral("ComponentDefinition");
    }

    bool isEventName(const QString &name) const
    {
        return name.startsWith(QStringLiteral("on")) || name.endsWith(QStringLiteral("changed"));
    }

    QStringList parseSelectorList(const QString &first)
    {
        QStringList selectors;
        selectors.append(first);
        while (peek() == QLatin1Char(',')) {
            consume();
            const QString next = parseIdentifier();
            if (!next.isEmpty()) {
                selectors.append(next);
            }
            skipWhitespace();
        }
        return selectors;
    }

    QVariantMap parseNamedBlock(int start, const QString &type, const QString &nameKey)
    {
        const QString name = parseTypeIdentifier();
        skipWhitespace();
        QVariantList children;
        if (peek() == QLatin1Char('{')) {
            consume();
            children = parseItems(QLatin1Char('}'));
            if (peek() == QLatin1Char('}')) {
                consume();
            }
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), type},
            {nameKey, name.trimmed()},
            {QStringLiteral("items"), children},
        }), start, m_index);
    }

    QVariantMap parseNamedBody(int start, const QString &type, const QString &nameKey)
    {
        const QString name = parseTypeIdentifier();
        skipWhitespace();
        QString body;
        if (peek() == QLatin1Char('{')) {
            consume();
            body = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), type},
            {nameKey, name.trimmed()},
            {QStringLiteral("body"), body},
        }), start, m_index);
    }

    QVariantMap parseNamedRawBody(int start, const QString &type, const QString &nameKey, const QString &bodyKey)
    {
        QVariantMap item = parseNamedBody(start, type, nameKey);
        item.insert(bodyKey, item.value(QStringLiteral("body")));
        return item;
    }

    QVariantMap parseSignal(int start)
    {
        const QString name = parseReferenceIdentifier();
        QString parameters;
        skipWhitespace();
        if (peek() == QLatin1Char('(')) {
            consume();
            parameters = readBalanced(QLatin1Char('('), QLatin1Char(')'));
            skipWhitespace();
        }
        if (peek() == QLatin1Char('{')) {
            consume();
            QVariantList children = parseItems(QLatin1Char('}'));
            if (peek() == QLatin1Char('}')) {
                consume();
            }
            return withCommon(mapOf({
                {QStringLiteral("type"), QStringLiteral("SignalDefinition")},
                {QStringLiteral("signalId"), name.trimmed()},
                {QStringLiteral("parameters"), splitParameters(parameters)},
                {QStringLiteral("items"), children},
            }), start, m_index);
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("SignalDeclaration")},
            {QStringLiteral("name"), name.trimmed()},
            {QStringLiteral("parameters"), splitParameters(parameters)},
            {QStringLiteral("signature"), name.trimmed() + QLatin1Char('(') + parameters.trimmed() + QLatin1Char(')')},
        }), start, m_index);
    }

    QVariantMap parseCallback(int start)
    {
        const QString name = parseReferenceIdentifier();
        QString parameters;
        skipWhitespace();
        if (peek() == QLatin1Char('(')) {
            consume();
            parameters = readBalanced(QLatin1Char('('), QLatin1Char(')'));
            skipWhitespace();
        }
        QString body;
        if (peek() == QLatin1Char('{')) {
            consume();
            body = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("CallbackDeclaration")},
            {QStringLiteral("name"), name.trimmed()},
            {QStringLiteral("parameters"), splitParameters(parameters)},
            {QStringLiteral("signature"), name.trimmed() + QLatin1Char('(') + parameters.trimmed() + QLatin1Char(')')},
            {QStringLiteral("body"), body},
        }), start, m_index);
    }

    QVariantMap parseQPropertyDeclaration(int start)
    {
        const QString name = parseReferenceIdentifier();
        skipWhitespace();
        QString rawValue;
        QVariant value;
        if (peek() == QLatin1Char(':')) {
            consume();
            rawValue = parseBareValue();
            value = valueFromRaw(rawValue);
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("QPropertyDeclaration")},
            {QStringLiteral("name"), name.trimmed()},
            {QStringLiteral("rawValue"), rawValue},
            {QStringLiteral("value"), value},
        }), start, m_index);
    }

    QVariantMap parseBehaviorBlock(int start)
    {
        QString keyword = parseReferenceIdentifier();
        QString propertyName;
        if (keyword.toLower() == QLatin1String("on")) {
            propertyName = parseReferenceIdentifier();
        } else {
            propertyName = keyword;
        }

        skipWhitespace();
        QString body;
        QVariantList children;
        if (peek() == QLatin1Char('{')) {
            consume();
            body = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
            SymbolicParser nested(body);
            children = nested.parseItems(QChar());
        }

        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("BehaviorBlock")},
            {QStringLiteral("propertyName"), propertyName.trimmed()},
            {QStringLiteral("body"), body},
            {QStringLiteral("items"), children},
        }), start, m_index);
    }

    QVariantMap parseFunctionBlock(int start)
    {
        const QString methodName = parseReferenceIdentifier();
        return parseNamedFunctionBlock(start, methodName);
    }

    QVariantMap parseNamedFunctionBlock(int start, const QString &methodName)
    {
        QString parameters;
        skipWhitespace();
        if (peek() == QLatin1Char('(')) {
            consume();
            parameters = readBalanced(QLatin1Char('('), QLatin1Char(')'));
            skipWhitespace();
        }
        QString body;
        if (peek() == QLatin1Char('{')) {
            consume();
            body = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("FunctionBlock")},
            {QStringLiteral("name"), methodName.trimmed()},
            {QStringLiteral("parameters"), parameters.trimmed()},
            {QStringLiteral("parameterList"), splitParameters(parameters)},
            {QStringLiteral("signature"), methodName.trimmed() + QLatin1Char('(') + parameters.trimmed() + QLatin1Char(')')},
            {QStringLiteral("body"), body},
        }), start, m_index);
    }

    QVariantMap parseEventBlock(int start, const QString &name)
    {
        QString parameters;
        skipWhitespace();
        if (peek() == QLatin1Char('(')) {
            consume();
            parameters = readBalanced(QLatin1Char('('), QLatin1Char(')'));
            skipWhitespace();
        }
        QString script;
        if (peek() == QLatin1Char('{')) {
            consume();
            script = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("EventBlock")},
            {QStringLiteral("name"), name},
            {QStringLiteral("parameters"), splitParameters(parameters)},
            {QStringLiteral("script"), script},
            {QStringLiteral("isLifecycle"), lowerTrimmed(name) == QLatin1String("onready") || lowerTrimmed(name) == QLatin1String("onload") || lowerTrimmed(name) == QLatin1String("onloaded")},
        }), start, m_index);
    }

    QVariantMap parseQClassDefinition(int start)
    {
        const QString className = parseReferenceIdentifier();
        QString extendsClass;
        skipWhitespace();
        if (lowerTrimmed(m_source.mid(m_index, 7)) == QLatin1String("extends")) {
            m_index += 7;
            extendsClass = parseReferenceIdentifier();
            skipWhitespace();
        }
        QString bodySource;
        QVariantList bodyItems;
        QVariantList methods;
        QVariantMap constructorDef;
        QVariantList slotItems;
        if (peek() == QLatin1Char('{')) {
            consume();
            const int bodyStart = m_index;
            bodySource = readBalanced(QLatin1Char('{'), QLatin1Char('}'));
            SymbolicParser nested(bodySource);
            bodyItems = nested.parseItems(QChar());
            for (const QVariant &entry : bodyItems) {
                const QVariantMap item = entry.toMap();
                const QString type = item.value(QStringLiteral("type")).toString();
                const QString itemName = item.value(QStringLiteral("name")).toString();
                if (type == QLatin1String("FunctionBlock")) {
                    if (itemName == QLatin1String("constructor") || itemName == className) {
                        constructorDef = mapOf({
                            {QStringLiteral("parameters"), item.value(QStringLiteral("parameters"))},
                            {QStringLiteral("parameterList"), item.value(QStringLiteral("parameterList"))},
                            {QStringLiteral("body"), item.value(QStringLiteral("body"))},
                        });
                    } else {
                        methods.append(item);
                    }
                } else if (type == QLatin1String("Element") && item.value(QStringLiteral("selectors")).toStringList().contains(QStringLiteral("slot"))) {
                    slotItems.append(item);
                }
            }
            Q_UNUSED(bodyStart);
        }
        return withCommon(mapOf({
            {QStringLiteral("type"), QStringLiteral("QClassDefinition")},
            {QStringLiteral("classId"), className.trimmed()},
            {QStringLiteral("extendsClassId"), extendsClass.trimmed()},
            {QStringLiteral("constructorDefinition"), constructorDef},
            {QStringLiteral("methods"), methods},
            {QStringLiteral("slots"), slotItems},
            {QStringLiteral("items"), bodyItems},
            {QStringLiteral("body"), bodySource},
        }), start, m_index);
    }
};

} // namespace

QMap<QString, QVariant> QHtmlParser::toAST(const QString &source) const
{
    SymbolicParser parser(source);
    return parser.parseDocument();
}

QString QHtmlParser::toASTJson(const QString &source) const
{
    const QVariantMap ast = toAST(source);
    return QString::fromUtf8(QJsonDocument(QJsonObject::fromVariantMap(ast)).toJson(QJsonDocument::Compact));
}

QString QHtmlParser::createParserUuid()
{
    return QUuid::createUuid().toString(QUuid::WithoutBraces);
}

QString QHtmlParser::normalizeWasmMode(const QString &value)
{
    const QString mode = lowerTrimmed(value);
    if (mode == QLatin1String("main") ||
        mode == QLatin1String("main-thread") ||
        mode == QLatin1String("mainthread")) {
        return QStringLiteral("main");
    }
    if (mode == QLatin1String("worker") ||
        mode == QLatin1String("worker-thread") ||
        mode == QLatin1String("workerthread")) {
        return QStringLiteral("worker");
    }
    return QString();
}

std::optional<bool> QHtmlParser::parseWasmBoolean(const QString &value)
{
    const QString v = lowerTrimmed(value);
    if (v.isEmpty()) {
        return std::nullopt;
    }
    if (v == QLatin1String("true") || v == QLatin1String("1") ||
        v == QLatin1String("yes") || v == QLatin1String("on")) {
        return true;
    }
    if (v == QLatin1String("false") || v == QLatin1String("0") ||
        v == QLatin1String("no") || v == QLatin1String("off")) {
        return false;
    }
    return std::nullopt;
}

std::optional<int> QHtmlParser::parseWasmPositiveInteger(const QString &value)
{
    bool ok = false;
    const qlonglong n = value.trimmed().toLongLong(&ok, 10);
    if (!ok || n < 0 || n > std::numeric_limits<int>::max()) {
        return std::nullopt;
    }
    return static_cast<int>(n);
}

QList<QVariant> QHtmlParser::parseQWasmBindingRules(const QString &rawBody)
{
    QList<QVariant> out;
    QSet<QString> seen;
    const QStringList entries = rawBody.split(QRegularExpression(QStringLiteral("[,\\n;]")), Qt::SkipEmptyParts);
    const QRegularExpression re(QStringLiteral("^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*->\\s*(method|signal)\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*$"));

    for (const QString &entry : entries) {
        const QRegularExpressionMatch match = re.match(entry.trimmed());
        if (!match.hasMatch()) {
            continue;
        }
        const QString exportName = match.captured(1);
        const QString targetType = match.captured(2);
        const QString targetName = match.captured(3);
        const QString key = exportName.toLower() + QStringLiteral("::") + targetType.toLower() + QStringLiteral("::") + targetName.toLower();
        if (seen.contains(key)) {
            continue;
        }
        seen.insert(key);
        out.append(mapOf({
            {QStringLiteral("exportName"), exportName},
            {QStringLiteral("targetType"), targetType},
            {QStringLiteral("targetName"), targetName},
        }));
    }
    return out;
}

QMap<QString, QVariant> QHtmlParser::parseQWasmConfig(const QString &rawBody)
{
    QVariantMap result;
    QString remaining = rawBody;
    QStringList exportsList;
    QStringList allowList;
    QList<QVariant> bindList;

    const QRegularExpression blockRe(QStringLiteral("\\b(exports|allowimports|bind)\\s*\\{([\\s\\S]*?)\\}"), QRegularExpression::CaseInsensitiveOption);
    QRegularExpressionMatchIterator blockIt = blockRe.globalMatch(rawBody);
    QList<QRegularExpressionMatch> blockMatches;
    while (blockIt.hasNext()) {
        blockMatches.append(blockIt.next());
    }
    for (int i = blockMatches.size() - 1; i >= 0; --i) {
        const QRegularExpressionMatch match = blockMatches.at(i);
        const QString key = match.captured(1).toLower();
        const QString body = match.captured(2);
        if (key == QLatin1String("exports")) {
            for (const QString &name : body.split(QRegularExpression(QStringLiteral("[,\\s]+")), Qt::SkipEmptyParts)) {
                if (!exportsList.contains(name, Qt::CaseInsensitive)) {
                    exportsList.append(name);
                }
            }
        } else if (key == QLatin1String("allowimports")) {
            for (const QString &name : body.split(QRegularExpression(QStringLiteral("[,\\s]+")), Qt::SkipEmptyParts)) {
                if (!allowList.contains(name, Qt::CaseInsensitive)) {
                    allowList.append(name);
                }
            }
        } else if (key == QLatin1String("bind")) {
            bindList = parseQWasmBindingRules(body);
        }
        remaining.remove(match.capturedStart(), match.capturedLength());
    }

    const QRegularExpression kvRe(QStringLiteral("\\b(src|mode|awaitwasm|timeoutms|maxpayloadbytes)\\s*:\\s*([^,;\\n\\r]+)"), QRegularExpression::CaseInsensitiveOption);
    QRegularExpressionMatchIterator kvIt = kvRe.globalMatch(remaining);
    while (kvIt.hasNext()) {
        const QRegularExpressionMatch match = kvIt.next();
        const QString key = match.captured(1).toLower();
        QString value = match.captured(2).trimmed();
        if ((value.startsWith(QLatin1Char('"')) && value.endsWith(QLatin1Char('"'))) ||
            (value.startsWith(QLatin1Char('\'')) && value.endsWith(QLatin1Char('\'')))) {
            value = value.mid(1, value.size() - 2);
        }
        if (key == QLatin1String("src")) {
            result.insert(QStringLiteral("src"), value);
        } else if (key == QLatin1String("mode")) {
            result.insert(QStringLiteral("mode"), normalizeWasmMode(value));
        } else if (key == QLatin1String("awaitwasm")) {
            const auto parsed = parseWasmBoolean(value);
            result.insert(QStringLiteral("awaitWasm"), parsed.has_value() ? QVariant(parsed.value()) : QVariant());
        } else if (key == QLatin1String("timeoutms")) {
            const auto parsed = parseWasmPositiveInteger(value);
            result.insert(QStringLiteral("timeoutMs"), parsed.has_value() ? QVariant(parsed.value()) : QVariant());
        } else if (key == QLatin1String("maxpayloadbytes")) {
            const auto parsed = parseWasmPositiveInteger(value);
            result.insert(QStringLiteral("maxPayloadBytes"), parsed.has_value() ? QVariant(parsed.value()) : QVariant());
        }
    }

    if (!result.contains(QStringLiteral("src"))) {
        result.insert(QStringLiteral("src"), QString());
    }
    if (!result.contains(QStringLiteral("mode"))) {
        result.insert(QStringLiteral("mode"), QString());
    }
    if (!result.contains(QStringLiteral("awaitWasm"))) {
        result.insert(QStringLiteral("awaitWasm"), QVariant());
    }
    if (!result.contains(QStringLiteral("timeoutMs"))) {
        result.insert(QStringLiteral("timeoutMs"), QVariant());
    }
    if (!result.contains(QStringLiteral("maxPayloadBytes"))) {
        result.insert(QStringLiteral("maxPayloadBytes"), QVariant());
    }
    result.insert(QStringLiteral("exports"), exportsList);
    result.insert(QStringLiteral("allowImports"), allowList);
    result.insert(QStringLiteral("bind"), QVariant::fromValue(bindList));
    return result;
}
