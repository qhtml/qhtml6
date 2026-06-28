#pragma once

#include <QtCore/QByteArray>
#include <QtCore/QHash>
#include <QtCore/QList>
#include <QtCore/QSharedPointer>
#include <QtCore/QString>
#include <QtCore/QStringList>
#include <QtCore/QVariant>
#include <QtCore/QVector>

#include <functional>
#include <string>
#include <utility>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#endif

namespace qhtml::wasm {

enum class QDomNodeKind {
    Document,
    Component,
    ComponentInstance,
    Element,
    Slot,
    Text,
    RawHtml,
    Model,
    Repeater,
    TemplateInstance,
    StructDefinition,
    StructInstance,
    ClassDefinition,
    ClassInstance,
    ScriptRule,
    Color
};

struct QDomSourceRange {
    int begin = -1;
    int end = -1;

    [[nodiscard]] bool isValid() const { return begin >= 0 && end >= begin; }
};

struct QDomOptionalText {
    bool hasValue = false;
    QString value;

    static QDomOptionalText null() { return {}; }
    static QDomOptionalText of(QString text) { return {true, std::move(text)}; }
};

struct QDomThemeTransition {
    QString property;
    int durationMs = 0;
    QString easing;
    QHash<QString, QVariant> options;
};

struct QDomThemeRule {
    QString selector;
    QHash<QString, QString> declarations;
    QStringList classes;
    QHash<QString, QVariant> painters;
    QVector<QDomThemeTransition> transitions;
};

struct QDomRuntimeThemeRules {
    QVector<QDomThemeRule> defaultRules;
    QVector<QDomThemeRule> rules;
    QHash<QString, QVariant> painters;
    QHash<QString, QVector<QDomThemeTransition>> transitions;

    [[nodiscard]] bool isEmpty() const
    {
        return defaultRules.isEmpty() && rules.isEmpty() && painters.isEmpty() && transitions.isEmpty();
    }
};

struct QDomMeta {
    bool dirty = false;
    bool generated = false;
    bool hasRuntimeThemeRules = false;
    QDomSourceRange sourceRange;
    QString source;
    QString uuid;
    QString declarationKind;
    QString declarationName;

    QStringList imports;
    QStringList importDeclarations;
    QStringList sdmlEndpoints;
    QStringList sdmlComponents;
    QStringList qTimers;
    QStringList qMacros;
    QStringList qRewrites;
    QStringList lifecycleScriptNames;

    QStringList loggerCategories;
    QHash<QString, QStringList> eventAttributeParams;
    QHash<QString, QVariant> eventAttributeThen;
    QString instanceAlias;
    QStringList structFieldOverrides;
    QHash<QString, QString> propertyCssUnits;
    QDomRuntimeThemeRules runtimeThemeRules;
    QHash<QString, QVariant> qModels;
};

struct QDomStyleDefinition {
    QString name;
    QHash<QString, QString> declarations;
    QDomMeta meta;
};

struct QDomThemeDefinition {
    QString name;
    QHash<QString, QStringList> selectorStyleRefs;
    QVector<QDomThemeRule> rules;
    QDomMeta meta;
};

using QDomAttributes = QHash<QString, QString>;
using QDomProperties = QHash<QString, QVariant>;

struct QDomLifecycleScript {
    QString name;
    QString body;
    bool isQConnect = false;
};

struct QDomConnectionDefinition {
    QString senderAlias;
    QString signalName;
    QString targetAlias;
    QString methodName;
    QString source;
    QDomMeta meta;
};

struct QDomTextBinding {
    QString expression;
    QString alias;
    QString propertyName;
    QDomSourceRange sourceRange;
};

struct QDomPropertyDefinition {
    QString name;
    QString typeName;
    QVariant defaultValue;
    QString uuid;
    QDomMeta meta;
};

struct QDomMethodDefinition {
    QString name;
    QString signature;
    QString parameters;
    QString body;
};

struct QDomSignalDeclaration {
    QString name;
    QString signature;
    QStringList parameters;
    QString uuid;
    QDomMeta meta;
};

struct QDomCallbackDeclaration {
    QString name;
    QString signature;
    QStringList parameters;
    QString body;
    QDomMeta meta;
};

struct QDomAliasDeclaration {
    QString name;
    QString target;
    QDomMeta meta;
};

struct QDomVarDeclaration {
    QString name;
    QVariant value;
    QDomMeta meta;
};

struct QDomSwitchDeclaration {
    QString name;
    QHash<QString, QVariant> cases;
    QDomMeta meta;
};

struct QDomTimerDefinition {
    QString name;
    int intervalMs = 0;
    bool running = false;
    QString body;
    QDomMeta meta;
};

struct QDomSlotDefault {
    QString name;
    QVector<QSharedPointer<struct QDomNode>> nodes;
};

struct QDomWasmConfig {
    bool enabled = false;
    QString moduleName;
    QStringList exportedFunctions;
    QHash<QString, QVariant> options;
};

struct QDomNode {
    explicit QDomNode(QDomNodeKind nodeKind) : kind(nodeKind) {}
    virtual ~QDomNode() = default;

    QDomNodeKind kind;
    QDomMeta meta;
    QDomAttributes attributes;
    QDomProperties properties;
    QStringList styleRefs;
    QStringList themeRefs;
    QVector<QDomAliasDeclaration> aliasDeclarations;
    QVector<QDomMethodDefinition> methods;
    QVector<QDomSignalDeclaration> signalDeclarations;
    QHash<QString, QString> contextSymbols;
    QDomOptionalText textContent;
    QString selectorMode = QStringLiteral("single");
    QStringList selectorChain;
};

using QDomNodePtr = QSharedPointer<QDomNode>;

class QDomDocumentNode final : public QDomNode {
public:
    QDomDocumentNode() : QDomNode(QDomNodeKind::Document) {}

    int version = 1;
    QVector<QDomNodePtr> nodes;
    QVector<QDomStyleDefinition> styleDefinitions;
    QVector<QDomThemeDefinition> themeDefinitions;
    QVector<QDomConnectionDefinition> connectionDefinitions;
    QVector<QDomLifecycleScript> lifecycleScripts;
    QStringList scripts;
};

struct QDomTextNode final : QDomNode {
    QDomTextNode() : QDomNode(QDomNodeKind::Text) {}

    QString value;
    QVector<QDomTextBinding> bindings;
};

class QDomRawHtmlNode final : public QDomNode {
public:
    QDomRawHtmlNode() : QDomNode(QDomNodeKind::RawHtml) {}

    QString html;
};

class QDomModelNode final : public QDomNode {
public:
    QDomModelNode() : QDomNode(QDomNodeKind::Model) {}

    QString name;
    QVariant source;
    QVariantList entries;
    QString alias;
};

class QDomRepeaterNode final : public QDomNode {
public:
    QDomRepeaterNode() : QDomNode(QDomNodeKind::Repeater) {}

    QString repeaterId;
    QString modelRef;
    QString alias;
    QVector<QDomNodePtr> templateNodes;
};

struct QDomElementNode final : QDomNode {
    QDomElementNode() : QDomNode(QDomNodeKind::Element) {}

    QString tagName;
    QDomAttributes attributes;
    QVector<QDomNodePtr> children;
};

struct QDomSlotNode final : QDomNode {
    QDomSlotNode() : QDomNode(QDomNodeKind::Slot) {}

    QString name;
    QVector<QDomNodePtr> children;
};

using QDomSlotNodePtr = QSharedPointer<QDomSlotNode>;

struct QDomComponentDefinitionNode final : QDomNode {
    QDomComponentDefinitionNode() : QDomNode(QDomNodeKind::Component) {}

    QString componentId;
    QStringList extendsComponentIds;
    QString extendsComponentId;
    QString definitionType = QStringLiteral("component");

    QVector<QDomNodePtr> templateNodes;
    QVector<QDomSlotDefault> slotDefaults;
    QVector<QDomPropertyDefinition> propertyDefinitions;
    QVector<QDomMethodDefinition> methods;
    QVector<QDomSignalDeclaration> signalDeclarations;
    QVector<QDomCallbackDeclaration> callbackDeclarations;
    QVector<QDomAliasDeclaration> aliasDeclarations;
    QVector<QDomVarDeclaration> varDeclarations;
    QVector<QDomSwitchDeclaration> switchDeclarations;
    QVector<QDomTimerDefinition> qTimerDefinitions;
    QDomWasmConfig wasmConfig;
    QVector<QDomLifecycleScript> lifecycleScripts;

    QDomAttributes attributes;
    QStringList properties;
};

struct QDomComponentInstanceNode final : QDomNode {
    QDomComponentInstanceNode() : QDomNode(QDomNodeKind::ComponentInstance) {}

    QString componentId;
    QString tagName;
    QDomAttributes attributes;
    QDomProperties props;
    QVector<QDomSlotNodePtr> slotNodes;
    QVector<QDomLifecycleScript> lifecycleScripts;
    QVector<QDomNodePtr> children;
};

class QDomTemplateInstanceNode final : public QDomNode {
public:
    QDomTemplateInstanceNode() : QDomNode(QDomNodeKind::TemplateInstance) {}

    QString templateId;
    QString tagName;
    QDomProperties props;
    QVector<QDomSlotNodePtr> slotNodes;
    QVector<QDomLifecycleScript> lifecycleScripts;
    QVector<QDomNodePtr> children;
};

class QDomStructDefinitionNode final : public QDomNode {
public:
    QDomStructDefinitionNode() : QDomNode(QDomNodeKind::StructDefinition) {}

    QString structId;
    QString definitionType = QStringLiteral("struct");
    QVector<QDomPropertyDefinition> fields;
    QVector<QDomNodePtr> fieldNodes;
};

class QDomStructInstanceNode final : public QDomNode {
public:
    QDomStructInstanceNode() : QDomNode(QDomNodeKind::StructInstance) {}

    QString structId;
    QString alias;
    QDomProperties fields;
};

class QDomClassDefinitionNode final : public QDomNode {
public:
    QDomClassDefinitionNode() : QDomNode(QDomNodeKind::ClassDefinition) {}

    QString classId;
    QString extendsClassId;
    QString constructorSignature;
    QString constructorParameters;
    QString constructorBody;
    QVector<QDomPropertyDefinition> propertyDefinitions;
    QVector<QDomSlotDefault> slotDefaults;
    QVector<QDomCallbackDeclaration> callbackDeclarations;
    QVector<QDomVarDeclaration> varDeclarations;
    QVector<QDomSwitchDeclaration> switchDeclarations;
    QVector<QDomTimerDefinition> qTimerDefinitions;
    QVector<QDomLifecycleScript> lifecycleScripts;
};

class QDomClassInstanceNode final : public QDomNode {
public:
    QDomClassInstanceNode() : QDomNode(QDomNodeKind::ClassInstance) {}

    QString classId;
    QString alias;
    QString argumentSource;
    QVariantList arguments;
    QDomProperties props;
    QVector<QDomSlotNodePtr> slotNodes;
    QVector<QDomNodePtr> children;
};

class QDomScriptRuleNode final : public QDomNode {
public:
    QDomScriptRuleNode() : QDomNode(QDomNodeKind::ScriptRule) {}

    QString name;
    QString parameters;
    QString body;
    bool isLifecycle = false;
    bool isConnection = false;
};

class QDomColorNode final : public QDomNode {
public:
    QDomColorNode() : QDomNode(QDomNodeKind::Color) {}

    QString name;
    QString value;
    QHash<QString, QString> channels;
};

struct QDomDocument {
    QDomMeta meta;
    int version = 1;
    QVector<QDomNodePtr> nodes;
    QVector<QDomStyleDefinition> styleDefinitions;
    QVector<QDomThemeDefinition> themeDefinitions;
    QVector<QDomConnectionDefinition> connectionDefinitions;
    QVector<QDomLifecycleScript> lifecycleScripts;
    QStringList scripts;
};

class QDomDynamicSignal {
public:
    using Handler = std::function<void(const QVariantList &)>;

    int connect(Handler handler)
    {
        const int id = ++lastId_;
        handlers_.insert(id, std::move(handler));
        return id;
    }

    bool disconnect(int id)
    {
        return handlers_.remove(id) > 0;
    }

    void fire(const QVariantList &arguments) const
    {
        for (const auto &handler : handlers_) {
            handler(arguments);
        }
    }

    [[nodiscard]] bool hasSubscribers() const { return !handlers_.isEmpty(); }

private:
    int lastId_ = 0;
    QHash<int, Handler> handlers_;
};

class QDomComponentObject {
public:
    using MethodHandler = std::function<QVariant(QDomComponentObject &, const QVariantList &)>;

    static QDomComponentObject fromDefinition(
        const QDomComponentDefinitionNode &definition,
        const QDomComponentInstanceNode *instance = nullptr)
    {
        QDomComponentObject object;
        object.componentId_ = definition.componentId;
        object.instanceAlias_ = instance ? instance->meta.instanceAlias : QString();
        object.methodSources_ = indexMethods(definition.methods);

        for (const auto &signal : definition.signalDeclarations) {
            object.ensureSignal(signal.name);
        }

        for (const auto &propertyName : definition.properties) {
            if (definition.attributes.contains(propertyName)) {
                object.properties_.insert(propertyName, definition.attributes.value(propertyName));
            }
            object.ensureChangedSignals(propertyName);
        }

        for (auto it = definition.attributes.cbegin(); it != definition.attributes.cend(); ++it) {
            if (!object.properties_.contains(it.key()) && definition.properties.contains(it.key())) {
                object.properties_.insert(it.key(), it.value());
            }
        }

        if (instance) {
            for (auto it = instance->props.cbegin(); it != instance->props.cend(); ++it) {
                object.properties_.insert(it.key(), it.value());
                object.ensureChangedSignals(it.key());
            }
        }

        return object;
    }

    [[nodiscard]] QString componentId() const { return componentId_; }
    [[nodiscard]] QString instanceAlias() const { return instanceAlias_; }

    [[nodiscard]] QVariant propertyValue(const QString &name) const
    {
        return properties_.value(name);
    }

    [[nodiscard]] const QDomProperties &properties() const
    {
        return properties_;
    }

    bool setPropertyValue(const QString &name, const QVariant &value)
    {
        const QVariant oldValue = properties_.value(name);
        if (oldValue.isValid() && oldValue == value) {
            return false;
        }

        properties_.insert(name, value);
        ensureChangedSignals(name);

        const QVariantList args{value};
        fireSignal(name + QStringLiteral("Changed"), args);
        fireSignal(name.toLower() + QStringLiteral("changed"), args);
        return true;
    }

    int connectSignal(const QString &name, QDomDynamicSignal::Handler handler)
    {
        return signal(name).connect(std::move(handler));
    }

    void emitSignal(const QString &name, const QVariantList &arguments = {})
    {
        fireSignal(name, arguments);
    }

    void connectSignalToMethod(const QString &signalName, const QString &methodName)
    {
        ensureSignal(signalName);
        signalMethodLinks_[signalName].append(methodName);
    }

    void registerMethod(const QString &name, MethodHandler handler)
    {
        nativeMethods_.insert(name, std::move(handler));
    }

    QVariant callMethod(const QString &name, const QVariantList &arguments = {})
    {
        const auto handler = nativeMethods_.constFind(name);
        if (handler != nativeMethods_.cend()) {
            return (*handler)(*this, arguments);
        }

        return QVariant();
    }

    [[nodiscard]] QString methodSource(const QString &name) const
    {
        return methodSources_.value(name).body;
    }

private:
    static QHash<QString, QDomMethodDefinition> indexMethods(const QVector<QDomMethodDefinition> &methods)
    {
        QHash<QString, QDomMethodDefinition> indexed;
        for (const auto &method : methods) {
            indexed.insert(method.name, method);
        }
        return indexed;
    }

    QDomDynamicSignal &signal(const QString &name)
    {
        ensureSignal(name);
        return signals_[name];
    }

    void ensureSignal(const QString &name)
    {
        if (!signals_.contains(name)) {
            signals_.insert(name, QDomDynamicSignal());
        }
    }

    void ensureChangedSignals(const QString &propertyName)
    {
        ensureSignal(propertyName + QStringLiteral("Changed"));
        ensureSignal(propertyName.toLower() + QStringLiteral("changed"));
    }

    void fireSignal(const QString &name, const QVariantList &arguments)
    {
        signal(name).fire(arguments);

        const auto linkedMethods = signalMethodLinks_.value(name);
        for (const auto &methodName : linkedMethods) {
            callMethod(methodName, arguments);
        }
    }

    QString componentId_;
    QString instanceAlias_;
    QDomProperties properties_;
    QHash<QString, QDomDynamicSignal> signals_;
    QHash<QString, QDomMethodDefinition> methodSources_;
    QHash<QString, MethodHandler> nativeMethods_;
    QHash<QString, QStringList> signalMethodLinks_;
};

class QDomRuntimeRegistry {
public:
    void registerDefinition(QSharedPointer<QDomComponentDefinitionNode> definition)
    {
        if (!definition) {
            return;
        }
        definitions_.insert(definition->componentId, std::move(definition));
    }

    QSharedPointer<QDomComponentObject> instantiate(const QDomComponentInstanceNode &instance)
    {
        const auto definition = definitions_.value(instance.componentId);
        if (!definition) {
            return {};
        }

        auto object = QSharedPointer<QDomComponentObject>::create(
            QDomComponentObject::fromDefinition(*definition, &instance));

        const QString alias = instance.meta.instanceAlias.isEmpty()
            ? instance.componentId
            : instance.meta.instanceAlias;
        objects_.insert(alias, object);
        return object;
    }

    QSharedPointer<QDomComponentObject> object(const QString &alias) const
    {
        return objects_.value(alias);
    }

    bool setProperty(const QString &alias, const QString &propertyName, const QVariant &value)
    {
        const auto target = object(alias);
        return target && target->setPropertyValue(propertyName, value);
    }

    QVariant property(const QString &alias, const QString &propertyName) const
    {
        const auto target = object(alias);
        return target ? target->propertyValue(propertyName) : QVariant();
    }

    QVariant callMethod(const QString &alias, const QString &methodName, const QVariantList &arguments = {})
    {
        const auto target = object(alias);
        return target ? target->callMethod(methodName, arguments) : QVariant();
    }

    bool connectSignalToMethod(
        const QString &senderAlias,
        const QString &signalName,
        const QString &targetAlias,
        const QString &methodName)
    {
        const auto sender = object(senderAlias);
        const auto target = object(targetAlias);
        if (!sender || !target) {
            return false;
        }

        if (sender == target) {
            sender->connectSignalToMethod(signalName, methodName);
            return true;
        }

        sender->connectSignal(signalName, [target, methodName](const QVariantList &args) {
            target->callMethod(methodName, args);
        });
        return true;
    }

    bool applyConnection(const QDomConnectionDefinition &connection)
    {
        return connectSignalToMethod(
            connection.senderAlias,
            connection.signalName,
            connection.targetAlias,
            connection.methodName);
    }

private:
    QHash<QString, QSharedPointer<QDomComponentDefinitionNode>> definitions_;
    QHash<QString, QSharedPointer<QDomComponentObject>> objects_;
};

inline QDomThemeRule makeThemeRule(QString selector, QHash<QString, QString> declarations)
{
    QDomThemeRule rule;
    rule.selector = std::move(selector);
    rule.declarations = std::move(declarations);
    return rule;
}

inline QDomNodePtr makeTextNode(QString uuid, QString value, QDomSourceRange range = {})
{
    auto node = QSharedPointer<QDomTextNode>::create();
    node->meta.uuid = std::move(uuid);
    node->meta.sourceRange = range;
    node->meta.generated = true;
    node->value = std::move(value);
    return node;
}

inline QDomSlotNodePtr makeSlotNode(
    QString uuid,
    QString name,
    QVector<QDomNodePtr> children = {},
    QDomSourceRange range = {})
{
    auto node = QSharedPointer<QDomSlotNode>::create();
    node->meta.uuid = std::move(uuid);
    node->meta.sourceRange = range;
    node->meta.generated = !range.isValid();
    node->name = std::move(name);
    node->children = std::move(children);
    node->selectorChain = {QStringLiteral("slot")};
    return node;
}

inline QDomNodePtr makeElementNode(
    QString uuid,
    QString tagName,
    QDomAttributes attributes = {},
    QVector<QDomNodePtr> children = {},
    QDomSourceRange range = {})
{
    auto node = QSharedPointer<QDomElementNode>::create();
    node->meta.uuid = std::move(uuid);
    node->meta.sourceRange = range;
    node->tagName = std::move(tagName);
    node->attributes = std::move(attributes);
    node->children = std::move(children);
    node->selectorChain = {node->tagName};
    return node;
}

inline QDomDocument makeSampleDocument()
{
    QDomDocument doc;
    doc.version = 1;
    doc.meta.uuid = QStringLiteral("d0e56be9-ee18-478d-916d-e719d015c969");
    doc.meta.dirty = false;

    auto button = makeElementNode(
        QStringLiteral("18feffe4-8003-40eb-9e47-3c1db10cae25"),
        QStringLiteral("button"),
        {{QStringLiteral("onclick"), QStringLiteral("this.component.prop1 = Math.random() * 500;")}},
        {makeTextNode(
            QStringLiteral("34cb3ea7-8e44-44b7-ac38-62f0e726827a"),
            QStringLiteral(" click here\n"),
            {461, 480})},
        {396, 482});

    auto component = QSharedPointer<QDomComponentDefinitionNode>::create();
    component->meta.uuid = QStringLiteral("86d6e13b-fede-4cac-96b2-70b5579a6b5a");
    component->meta.sourceRange = {0, 484};
    component->meta.loggerCategories = {
        QStringLiteral("q-component"),
        QStringLiteral("q-signal"),
        QStringLiteral("q-property"),
        QStringLiteral("function")
    };
    component->meta.eventAttributeParams.insert(QStringLiteral("onsignal1"), {QStringLiteral("val")});
    component->componentId = QStringLiteral("mycomp");
    component->templateNodes = {button};
    component->methods = {{
        QStringLiteral("function1"),
        QStringLiteral("function1(val)"),
        QStringLiteral("val"),
        QStringLiteral("this.component.signal1(val);")
    }};
    component->signalDeclarations = {{
        QStringLiteral("signal1"),
        QStringLiteral("signal1(testing)"),
        {QStringLiteral("testing")},
        QStringLiteral("90b90d25-2f3a-489e-ac89-3ca7323e9bcf"),
        {}
    }};
    component->lifecycleScripts = {{
        QStringLiteral("onready"),
        QStringLiteral("/* q-connect: prop1changed -> function1 */"),
        true
    }};
    component->attributes = {
        {QStringLiteral("prop1"), QStringLiteral("test")},
        {QStringLiteral("onprop1Changed"), QStringLiteral("this.component.function1(this.component.prop1);")},
        {QStringLiteral("onsignal1"), QStringLiteral("console.log(\"lifecycle completed\", val)")}
    };
    component->properties = {QStringLiteral("prop1")};

    auto instance = QSharedPointer<QDomComponentInstanceNode>::create();
    instance->meta.uuid = QStringLiteral("76512be4-2b9f-4ddf-8582-1e7bbb565bfc");
    instance->meta.sourceRange = {486, 505};
    instance->meta.instanceAlias = QStringLiteral("something");
    instance->componentId = QStringLiteral("mycomp");
    instance->tagName = QStringLiteral("mycomp");
    instance->props.insert(QStringLiteral("prop1"), QStringLiteral("test"));
    instance->selectorChain = {QStringLiteral("mycomp")};

    doc.nodes = {component, instance};
    return doc;
}

inline QDomComponentObject makeSampleRuntimeObject()
{
    const QDomDocument doc = makeSampleDocument();
    const auto component = qSharedPointerCast<QDomComponentDefinitionNode>(doc.nodes[0]);
    const auto instance = qSharedPointerCast<QDomComponentInstanceNode>(doc.nodes[1]);

    auto object = QDomComponentObject::fromDefinition(*component, instance.data());
    object.registerMethod(QStringLiteral("function1"), [](QDomComponentObject &self, const QVariantList &args) {
        self.emitSignal(QStringLiteral("signal1"), args);
        return QVariant();
    });
    object.connectSignalToMethod(QStringLiteral("prop1changed"), QStringLiteral("function1"));
    return object;
}

inline QString qStringFromStdString(const std::string &value)
{
    return QString::fromUtf8(value.data(), static_cast<qsizetype>(value.size()));
}

inline std::string stdStringFromQString(const QString &value)
{
    const QByteArray bytes = value.toUtf8();
    return std::string(bytes.constData(), static_cast<size_t>(bytes.size()));
}

class QDomComponentObjectBridge {
public:
    QDomComponentObjectBridge() = default;
    explicit QDomComponentObjectBridge(QDomComponentObject object) : object_(std::move(object)) {}

    [[nodiscard]] std::string componentId() const
    {
        return stdStringFromQString(object_.componentId());
    }

    [[nodiscard]] std::string instanceAlias() const
    {
        return stdStringFromQString(object_.instanceAlias());
    }

    [[nodiscard]] std::string propertyString(const std::string &name) const
    {
        return stdStringFromQString(object_.propertyValue(qStringFromStdString(name)).toString());
    }

    [[nodiscard]] double propertyNumber(const std::string &name) const
    {
        return object_.propertyValue(qStringFromStdString(name)).toDouble();
    }

    bool setPropertyString(const std::string &name, const std::string &value)
    {
        return object_.setPropertyValue(qStringFromStdString(name), qStringFromStdString(value));
    }

    bool setPropertyNumber(const std::string &name, double value)
    {
        return object_.setPropertyValue(qStringFromStdString(name), value);
    }

    void connectSignalToMethod(const std::string &signalName, const std::string &methodName)
    {
        object_.connectSignalToMethod(qStringFromStdString(signalName), qStringFromStdString(methodName));
    }

    void registerSignalForwarder(const std::string &methodName, const std::string &signalName)
    {
        const QString targetSignal = qStringFromStdString(signalName);
        object_.registerMethod(qStringFromStdString(methodName), [targetSignal](QDomComponentObject &self, const QVariantList &args) {
            self.emitSignal(targetSignal, args);
            return QVariant();
        });
    }

    void callMethodString(const std::string &methodName, const std::string &argument)
    {
        object_.callMethod(qStringFromStdString(methodName), {qStringFromStdString(argument)});
    }

    void callMethodNumber(const std::string &methodName, double argument)
    {
        object_.callMethod(qStringFromStdString(methodName), {argument});
    }

    void emitSignalString(const std::string &signalName, const std::string &argument)
    {
        object_.emitSignal(qStringFromStdString(signalName), {qStringFromStdString(argument)});
    }

    void emitSignalNumber(const std::string &signalName, double argument)
    {
        object_.emitSignal(qStringFromStdString(signalName), {argument});
    }

    [[nodiscard]] QDomComponentObject &object() { return object_; }
    [[nodiscard]] const QDomComponentObject &object() const { return object_; }

private:
    QDomComponentObject object_;
};

inline QDomComponentObjectBridge makeSampleRuntimeBridge()
{
    return QDomComponentObjectBridge(makeSampleRuntimeObject());
}

} // namespace qhtml::wasm

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(qhtml_qdom_typed_ir)
{
    emscripten::enum_<qhtml::wasm::QDomNodeKind>("QDomNodeKind")
        .value("Document", qhtml::wasm::QDomNodeKind::Document)
        .value("Component", qhtml::wasm::QDomNodeKind::Component)
        .value("ComponentInstance", qhtml::wasm::QDomNodeKind::ComponentInstance)
        .value("Element", qhtml::wasm::QDomNodeKind::Element)
        .value("Slot", qhtml::wasm::QDomNodeKind::Slot)
        .value("Text", qhtml::wasm::QDomNodeKind::Text)
        .value("RawHtml", qhtml::wasm::QDomNodeKind::RawHtml)
        .value("Model", qhtml::wasm::QDomNodeKind::Model)
        .value("Repeater", qhtml::wasm::QDomNodeKind::Repeater)
        .value("TemplateInstance", qhtml::wasm::QDomNodeKind::TemplateInstance)
        .value("StructDefinition", qhtml::wasm::QDomNodeKind::StructDefinition)
        .value("StructInstance", qhtml::wasm::QDomNodeKind::StructInstance)
        .value("ClassDefinition", qhtml::wasm::QDomNodeKind::ClassDefinition)
        .value("ClassInstance", qhtml::wasm::QDomNodeKind::ClassInstance)
        .value("ScriptRule", qhtml::wasm::QDomNodeKind::ScriptRule)
        .value("Color", qhtml::wasm::QDomNodeKind::Color);

    emscripten::class_<qhtml::wasm::QDomComponentObjectBridge>("QDomComponentObject")
        .constructor<>()
        .function("componentId", &qhtml::wasm::QDomComponentObjectBridge::componentId)
        .function("instanceAlias", &qhtml::wasm::QDomComponentObjectBridge::instanceAlias)
        .function("propertyString", &qhtml::wasm::QDomComponentObjectBridge::propertyString)
        .function("propertyNumber", &qhtml::wasm::QDomComponentObjectBridge::propertyNumber)
        .function("setPropertyString", &qhtml::wasm::QDomComponentObjectBridge::setPropertyString)
        .function("setPropertyNumber", &qhtml::wasm::QDomComponentObjectBridge::setPropertyNumber)
        .function("connectSignalToMethod", &qhtml::wasm::QDomComponentObjectBridge::connectSignalToMethod)
        .function("registerSignalForwarder", &qhtml::wasm::QDomComponentObjectBridge::registerSignalForwarder)
        .function("callMethodString", &qhtml::wasm::QDomComponentObjectBridge::callMethodString)
        .function("callMethodNumber", &qhtml::wasm::QDomComponentObjectBridge::callMethodNumber)
        .function("emitSignalString", &qhtml::wasm::QDomComponentObjectBridge::emitSignalString)
        .function("emitSignalNumber", &qhtml::wasm::QDomComponentObjectBridge::emitSignalNumber);

    emscripten::function("makeSampleRuntimeBridge", &qhtml::wasm::makeSampleRuntimeBridge);
}
#endif
