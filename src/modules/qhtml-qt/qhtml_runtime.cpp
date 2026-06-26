#include "qhtml_runtime.h"

#include <QAbstractAnimation>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QJsonValue>
#include <QMetaType>
#include <QPropertyAnimation>
#include <QEasingCurve>
#include <QSet>
#include <QUuid>
#include <QVariantList>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

namespace {

QString makeUuid()
{
    return QUuid::createUuid().toString(QUuid::WithoutBraces);
}

QString normalizeName(const QString &value)
{
    return value.trimmed();
}

QString jsToQString(const std::string &value)
{
    return QString::fromStdString(value);
}

std::string qToStd(const QString &value)
{
    return value.toStdString();
}

QVariant jsonToVariant(const QString &json)
{
    QJsonParseError error;
    const QJsonDocument doc = QJsonDocument::fromJson(json.toUtf8(), &error);
    if (error.error != QJsonParseError::NoError || doc.isNull()) {
        return json;
    }
    return doc.toVariant();
}

QString variantToJson(const QVariant &value)
{
    if (!value.isValid()) {
        return QStringLiteral("null");
    }

    const QJsonValue jsonValue = QJsonValue::fromVariant(value);
    if (jsonValue.isObject()) {
        return QString::fromUtf8(QJsonDocument(jsonValue.toObject()).toJson(QJsonDocument::Compact));
    }
    if (jsonValue.isArray()) {
        return QString::fromUtf8(QJsonDocument(jsonValue.toArray()).toJson(QJsonDocument::Compact));
    }

    QJsonArray wrapped;
    wrapped.append(jsonValue);
    const QString wrappedJson = QString::fromUtf8(QJsonDocument(wrapped).toJson(QJsonDocument::Compact));
    return wrappedJson.mid(1, wrappedJson.size() - 2);
}

QStringList mapKeys(const QVariantMap &map)
{
    QStringList keys = map.keys();
    keys.sort(Qt::CaseInsensitive);
    return keys;
}

#ifdef __EMSCRIPTEN__
QVariant valToVariant(emscripten::val value)
{
    if (value.isUndefined() || value.isNull()) {
        return QVariant();
    }

    const std::string type = value.typeOf().as<std::string>();
    if (type == "number") {
        return value.as<double>();
    }
    if (type == "boolean") {
        return value.as<bool>();
    }
    if (type == "string") {
        return QString::fromStdString(value.as<std::string>());
    }

    const std::string json = emscripten::val::global("JSON").call<std::string>("stringify", value);
    return jsonToVariant(QString::fromStdString(json));
}

emscripten::val variantToVal(const QVariant &value)
{
    return emscripten::val::global("JSON").call<emscripten::val>("parse", qToStd(variantToJson(value)));
}
#endif

} // namespace

QHTMLContext::QHTMLContext(QObject *parent)
    : QObject(parent)
{
}

void QHTMLContext::setOwnerUuid(const QString &uuid) { m_ownerUuid = uuid; }
QString QHTMLContext::ownerUuid() const { return m_ownerUuid; }
std::string QHTMLContext::ownerUuidJs() const { return qToStd(ownerUuid()); }

void QHTMLContext::setSymbol(const QString &name, const QString &uuid)
{
    const QString key = normalizeName(name);
    if (!key.isEmpty() && !uuid.isEmpty()) {
        m_symbols.insert(key, uuid);
    }
}

void QHTMLContext::setSymbolJs(const std::string &name, const std::string &uuid)
{
    setSymbol(jsToQString(name), jsToQString(uuid));
}

bool QHTMLContext::has(const QString &name) const
{
    return m_symbols.contains(normalizeName(name));
}

bool QHTMLContext::hasJs(const std::string &name) const
{
    return has(jsToQString(name));
}

QString QHTMLContext::uuidFor(const QString &name) const
{
    return m_symbols.value(normalizeName(name)).toString();
}

std::string QHTMLContext::getUUID(const std::string &name) const
{
    return qToStd(uuidFor(jsToQString(name)));
}

QStringList QHTMLContext::names() const
{
    return mapKeys(m_symbols);
}

QVariantMap QHTMLContext::toVariantMap() const
{
    QVariantMap out;
    out.insert(QStringLiteral("ownerUuid"), m_ownerUuid);
    out.insert(QStringLiteral("symbols"), m_symbols);
    out.insert(QStringLiteral("names"), names());
    return out;
}

QString QHTMLContext::toJson() const
{
    return variantToJson(toVariantMap());
}

std::string QHTMLContext::toJsonJs() const
{
    return qToStd(toJson());
}

#ifdef __EMSCRIPTEN__
emscripten::val QHTMLContext::toObjectJs() const
{
    return emscripten::val::global("JSON").call<emscripten::val>("parse", toJsonJs());
}
#endif

QHTMLElement::QHTMLElement(const QString &typeName, QHTMLNodeTree *tree, QObject *parent)
    : QObject(parent),
      m_uuid(makeUuid()),
      m_typeName(normalizeName(typeName).isEmpty() ? QStringLiteral("element") : normalizeName(typeName)),
      m_tree(tree)
{
    setObjectName(m_typeName);
}

QHTMLElement::QHTMLElement(const std::string &typeName)
    : QHTMLElement(jsToQString(typeName), nullptr, nullptr)
{
}

QHTMLNodeTree *QHTMLElement::tree() const { return m_tree; }
void QHTMLElement::setTree(QHTMLNodeTree *tree) { m_tree = tree; }

QString QHTMLElement::uuid() const { return m_uuid; }
std::string QHTMLElement::uuidJs() const { return qToStd(uuid()); }
void QHTMLElement::setUuid(const QString &uuid) { if (!uuid.isEmpty()) m_uuid = uuid; }
void QHTMLElement::setUuidJs(const std::string &uuid) { setUuid(jsToQString(uuid)); }

QString QHTMLElement::typeName() const { return m_typeName; }
std::string QHTMLElement::typeNameJs() const { return qToStd(typeName()); }
QString QHTMLElement::kind() const { return m_typeName; }
std::string QHTMLElement::kindJs() const { return qToStd(kind()); }

QString QHTMLElement::parentUuid() const { return m_parentUuid; }
std::string QHTMLElement::parentUuidJs() const { return qToStd(parentUuid()); }

QHTMLElement *QHTMLElement::parentElement() const
{
    return m_tree ? m_tree->getByQString(m_parentUuid) : nullptr;
}

QHTMLElement *QHTMLElement::parentElementJs() const
{
    return parentElement();
}

int QHTMLElement::childCount() const
{
    return m_childUuids.size();
}

QHTMLElement *QHTMLElement::childAt(int index) const
{
    if (!m_tree || index < 0 || index >= m_childUuids.size()) {
        return nullptr;
    }
    return m_tree->getByQString(m_childUuids.at(index));
}

QStringList QHTMLElement::childUuids() const
{
    return m_childUuids;
}

std::string QHTMLElement::childrenJson() const
{
    return qToStd(variantToJson(m_childUuids));
}

bool QHTMLElement::hasProperty(const std::string &name) const
{
    return m_properties.contains(normalizeName(jsToQString(name)));
}

void QHTMLElement::setString(const std::string &name, const std::string &value)
{
    setPropertyVariant(jsToQString(name), jsToQString(value), true);
}

void QHTMLElement::setNumber(const std::string &name, double value)
{
    setPropertyVariant(jsToQString(name), value, true);
}

void QHTMLElement::setBool(const std::string &name, bool value)
{
    setPropertyVariant(jsToQString(name), value, true);
}

std::string QHTMLElement::stringProperty(const std::string &name) const
{
    return qToStd(propertyVariant(jsToQString(name)).toString());
}

double QHTMLElement::numberProperty(const std::string &name) const
{
    return propertyVariant(jsToQString(name)).toDouble();
}

bool QHTMLElement::boolProperty(const std::string &name) const
{
    return propertyVariant(jsToQString(name)).toBool();
}

std::string QHTMLElement::propertyJson(const std::string &name) const
{
    return qToStd(variantToJson(propertyVariant(jsToQString(name))));
}

std::string QHTMLElement::propertyKeysJson() const
{
    return qToStd(variantToJson(mapKeys(m_properties)));
}

bool QHTMLElement::removePropertyJs(const std::string &name)
{
    const QString key = normalizeName(jsToQString(name));
    if (key.isEmpty() || !m_properties.contains(key)) {
        return false;
    }
    const QVariant previous = m_properties.take(key);
    setProperty(key.toUtf8().constData(), QVariant());
    if (m_tree) {
        m_tree->notifyPropertyChanged(this, key, QVariant(), previous);
    }
    return true;
}

#ifdef __EMSCRIPTEN__
void QHTMLElement::setPropertyValue(const std::string &name, emscripten::val value)
{
    setPropertyVariant(jsToQString(name), valToVariant(value), true);
}

emscripten::val QHTMLElement::propertyValue(const std::string &name) const
{
    return variantToVal(propertyVariant(jsToQString(name)));
}
#endif

void QHTMLElement::setSymbol(const QString &name, const QString &uuid)
{
    const QString key = normalizeName(name);
    if (!key.isEmpty()) {
        if (uuid.isEmpty()) {
            m_symbols.remove(key);
        } else {
            m_symbols.insert(key, uuid);
        }
    }
}

void QHTMLElement::setSymbolJs(const std::string &name, const std::string &uuid)
{
    setSymbol(jsToQString(name), jsToQString(uuid));
}

bool QHTMLElement::removeSymbolJs(const std::string &name)
{
    return m_symbols.remove(normalizeName(jsToQString(name))) > 0;
}

QString QHTMLElement::symbolUuid(const QString &name) const
{
    return m_symbols.value(normalizeName(name)).toString();
}

std::string QHTMLElement::symbolUuidJs(const std::string &name) const
{
    return qToStd(symbolUuid(jsToQString(name)));
}

QString QHTMLElement::symbolsJson() const
{
    return variantToJson(m_symbols);
}

std::string QHTMLElement::symbolsJsonJs() const
{
    return qToStd(symbolsJson());
}

QVariantMap QHTMLElement::symbols() const
{
    return m_symbols;
}

QHTMLContext *QHTMLElement::getContext() const
{
    return m_tree ? m_tree->contextFor(uuidJs()) : nullptr;
}

std::string QHTMLElement::resolveSymbol(const std::string &name) const
{
    return m_tree ? m_tree->resolveSymbol(uuidJs(), name) : std::string();
}

bool QHTMLElement::blockSignalsJs(bool block)
{
    return QObject::blockSignals(block);
}

bool QHTMLElement::signalsBlockedJs() const
{
    return QObject::signalsBlocked();
}

#ifdef __EMSCRIPTEN__
int QHTMLElement::connectJs(const std::string &signalName, emscripten::val callback)
{
    if (callback.isUndefined() || callback.isNull()) {
        return 0;
    }

    JsSignalConnection connection;
    connection.id = m_nextConnectionId++;
    connection.signalName = normalizeName(jsToQString(signalName));
    connection.callback = callback;
    m_signalConnections.append(connection);
    return connection.id;
}

bool QHTMLElement::disconnectJs(int connectionId)
{
    for (int i = 0; i < m_signalConnections.size(); ++i) {
        if (m_signalConnections.at(i).id == connectionId) {
            m_signalConnections.removeAt(i);
            return true;
        }
    }
    return false;
}

void QHTMLElement::emitJs(const std::string &signalName, emscripten::val payload)
{
    if (signalsBlocked()) {
        return;
    }

    const QString key = normalizeName(jsToQString(signalName));
    const QList<JsSignalConnection> connections = m_signalConnections;
    for (const JsSignalConnection &connection : connections) {
        if (connection.signalName == key && !connection.callback.isUndefined() && !connection.callback.isNull()) {
            connection.callback(payload);
        }
    }
}

void QHTMLElement::dispatchSignalJs(const std::string &signalName, emscripten::val payload)
{
    static const std::string dispatchName = "__qhtmlSignalDispatched";
    emitJs(signalName, payload);
    if (signalName == dispatchName) {
        return;
    }

    emscripten::val event = emscripten::val::object();
    event.set("type", std::string("signal"));
    event.set("signalName", signalName);
    event.set("name", signalName);
    event.set("payload", payload);
    event.set("value", payload);
    event.set("uuid", uuidJs());
    event.set("sourceUuid", uuidJs());
    event.set("typeName", typeNameJs());
    emitJs(dispatchName, event);
}

void QHTMLElement::dispatchPropertyChangedJs(const std::string &propertyName,
                                             emscripten::val value,
                                             emscripten::val previous)
{
    setPropertyVariant(jsToQString(propertyName), valToVariant(value), false);

    emscripten::val event = emscripten::val::object();
    event.set("type", std::string("property"));
    event.set("signalName", propertyName + "Changed");
    event.set("name", propertyName + "Changed");
    event.set("propertyName", propertyName);
    event.set("value", value);
    event.set("previous", previous);
    event.set("payload", value);
    event.set("uuid", uuidJs());
    event.set("sourceUuid", uuidJs());
    event.set("typeName", typeNameJs());

    emitJs(propertyName + "Changed", event);
    emitJs("__qhtmlPropertyDispatched", event);
    emitJs("__qhtmlSignalDispatched", event);
}

emscripten::val QHTMLElement::toObjectJs() const
{
    return emscripten::val::global("JSON").call<emscripten::val>("parse", toJsonJs());
}
#endif

QVariantMap QHTMLElement::toVariantMap() const
{
    QVariantMap out;
    out.insert(QStringLiteral("uuid"), m_uuid);
    out.insert(QStringLiteral("kind"), m_typeName);
    out.insert(QStringLiteral("typeName"), m_typeName);
    if (!m_parentUuid.isEmpty()) {
        out.insert(QStringLiteral("parentUuid"), m_parentUuid);
    }
    if (!m_childUuids.isEmpty()) {
        out.insert(QStringLiteral("children"), m_childUuids);
        out.insert(QStringLiteral("childUuids"), m_childUuids);
    }
    if (!m_properties.isEmpty()) {
        out.insert(QStringLiteral("properties"), m_properties);
    }
    if (!m_symbols.isEmpty()) {
        out.insert(QStringLiteral("symbols"), m_symbols);
    }
    return out;
}

QString QHTMLElement::toJson() const
{
    return variantToJson(toVariantMap());
}

std::string QHTMLElement::toJsonJs() const
{
    return qToStd(toJson());
}

void QHTMLElement::setParentUuid(const QString &uuid)
{
    m_parentUuid = uuid;
}

bool QHTMLElement::appendChildUuid(const QString &uuid)
{
    return insertChildUuid(m_childUuids.size(), uuid);
}

bool QHTMLElement::insertChildUuid(int index, const QString &uuid)
{
    if (uuid.isEmpty() || uuid == m_uuid) {
        return false;
    }
    m_childUuids.removeAll(uuid);
    m_childUuids.insert(qBound(0, index, m_childUuids.size()), uuid);
    return true;
}

bool QHTMLElement::removeChildUuid(const QString &uuid)
{
    return m_childUuids.removeOne(uuid);
}

void QHTMLElement::setPropertyVariant(const QString &name, const QVariant &value, bool notify)
{
    const QString key = normalizeName(name);
    if (key.isEmpty()) {
        return;
    }

    const QVariant previous = m_properties.value(key);
    m_properties.insert(key, value);
    setProperty(key.toUtf8().constData(), value);

    if (notify && previous != value && m_tree) {
        m_tree->notifyPropertyChanged(this, key, value, previous);
    }
}

QVariant QHTMLElement::propertyVariant(const QString &name) const
{
    return m_properties.value(normalizeName(name));
}

QHTMLComponent::QHTMLComponent(const QString &componentId, QHTMLNodeTree *tree)
    : QHTMLElement(QStringLiteral("component"), tree, nullptr),
      m_componentId(normalizeName(componentId))
{
    if (!m_componentId.isEmpty()) {
        setSymbol(m_componentId, uuid());
    }
}

QHTMLComponent::QHTMLComponent(const std::string &componentId)
    : QHTMLComponent(jsToQString(componentId), nullptr)
{
}

QString QHTMLComponent::componentId() const { return m_componentId; }
std::string QHTMLComponent::componentIdJs() const { return qToStd(componentId()); }

void QHTMLComponent::setComponentId(const QString &componentId)
{
    m_componentId = normalizeName(componentId);
    if (!m_componentId.isEmpty()) {
        setSymbol(m_componentId, uuid());
    }
}

void QHTMLComponent::setComponentIdJs(const std::string &componentId)
{
    setComponentId(jsToQString(componentId));
}

void QHTMLComponent::addPropertyName(const std::string &name)
{
    const QString key = normalizeName(jsToQString(name));
    if (!key.isEmpty() && !m_declaredProperties.contains(key)) {
        m_declaredProperties.append(key);
    }
}

void QHTMLComponent::addSignalName(const std::string &name)
{
    const QString key = normalizeName(jsToQString(name));
    if (!key.isEmpty() && !m_declaredSignals.contains(key)) {
        m_declaredSignals.append(key);
    }
}

bool QHTMLComponent::hasDeclaredProperty(const std::string &name) const
{
    return m_declaredProperties.contains(normalizeName(jsToQString(name)));
}

QStringList QHTMLComponent::declaredProperties() const { return m_declaredProperties; }
QStringList QHTMLComponent::declaredSignals() const { return m_declaredSignals; }
std::string QHTMLComponent::declaredPropertiesJson() const { return qToStd(variantToJson(m_declaredProperties)); }
std::string QHTMLComponent::declaredSignalsJson() const { return qToStd(variantToJson(m_declaredSignals)); }

QHTMLBinding::QHTMLBinding(QObject *parent)
    : QObject(parent),
      m_uuid(makeUuid())
{
}

QString QHTMLBinding::uuid() const { return m_uuid; }
std::string QHTMLBinding::uuidJs() const { return qToStd(uuid()); }
QString QHTMLBinding::sourceUuid() const { return m_sourceUuid; }
QString QHTMLBinding::sourceProperty() const { return m_sourceProperty; }
QString QHTMLBinding::targetUuid() const { return m_targetUuid; }
QString QHTMLBinding::targetProperty() const { return m_targetProperty; }

void QHTMLBinding::configure(const QString &sourceUuid,
                             const QString &sourceProperty,
                             const QString &targetUuid,
                             const QString &targetProperty)
{
    m_sourceUuid = sourceUuid;
    m_sourceProperty = normalizeName(sourceProperty);
    m_targetUuid = targetUuid;
    m_targetProperty = normalizeName(targetProperty);
}

void QHTMLBinding::configureJs(const std::string &sourceUuid,
                               const std::string &sourceProperty,
                               const std::string &targetUuid,
                               const std::string &targetProperty)
{
    configure(jsToQString(sourceUuid), jsToQString(sourceProperty), jsToQString(targetUuid), jsToQString(targetProperty));
}

bool QHTMLBinding::enabled() const { return m_enabled; }
void QHTMLBinding::setEnabled(bool enabled) { m_enabled = enabled; }

QVariantMap QHTMLBinding::toVariantMap() const
{
    QVariantMap out;
    out.insert(QStringLiteral("uuid"), m_uuid);
    out.insert(QStringLiteral("sourceUuid"), m_sourceUuid);
    out.insert(QStringLiteral("sourceProperty"), m_sourceProperty);
    out.insert(QStringLiteral("targetUuid"), m_targetUuid);
    out.insert(QStringLiteral("targetProperty"), m_targetProperty);
    out.insert(QStringLiteral("enabled"), m_enabled);
    return out;
}

std::string QHTMLBinding::toJsonJs() const
{
    return qToStd(variantToJson(toVariantMap()));
}

QHTMLNodeTree::QHTMLNodeTree(QObject *parent)
    : QObject(parent)
{
}

QHTMLNodeTree::~QHTMLNodeTree()
{
    qDeleteAll(m_contexts);
    qDeleteAll(m_bindings);
    qDeleteAll(m_nodes);
}

QHTMLElement *QHTMLNodeTree::createElement(const std::string &typeName)
{
    return createNode(typeName);
}

QHTMLComponent *QHTMLNodeTree::createComponent(const std::string &componentId)
{
    auto *node = new QHTMLComponent(jsToQString(componentId), this);
    registerNode(node);
    return node;
}

QHTMLElement *QHTMLNodeTree::createNode(const std::string &typeName)
{
    auto *node = new QHTMLElement(jsToQString(typeName), this, nullptr);
    registerNode(node);
    return node;
}

bool QHTMLNodeTree::registerNode(QHTMLElement *node)
{
    if (!node || node->uuid().isEmpty()) {
        return false;
    }
    if (m_nodes.contains(node->uuid()) && m_nodes.value(node->uuid()) != node) {
        return false;
    }
    node->setTree(this);
    m_nodes.insert(node->uuid(), node);
    return true;
}

QHTMLElement *QHTMLNodeTree::get(const std::string &uuid) const
{
    return getByQString(jsToQString(uuid));
}

QHTMLElement *QHTMLNodeTree::getByQString(const QString &uuid) const
{
    return m_nodes.value(uuid, nullptr);
}

bool QHTMLNodeTree::contains(const std::string &uuid) const
{
    return m_nodes.contains(jsToQString(uuid));
}

bool QHTMLNodeTree::remove(const std::string &uuid)
{
    const QString key = jsToQString(uuid);
    QHTMLElement *node = m_nodes.value(key, nullptr);
    if (!node) {
        return false;
    }

    detach(uuid);
    const QStringList children = node->childUuids();
    for (const QString &childUuid : children) {
        remove(qToStd(childUuid));
    }

    m_nodes.remove(key);
    delete node;
    return true;
}

int QHTMLNodeTree::size() const
{
    return m_nodes.size();
}

bool QHTMLNodeTree::addChild(const std::string &parentUuid, const std::string &childUuid)
{
    return insertChild(-1, parentUuid, childUuid);
}

bool QHTMLNodeTree::insertChild(int index, const std::string &parentUuid, const std::string &childUuid)
{
    QHTMLElement *parent = get(parentUuid);
    QHTMLElement *child = get(childUuid);
    if (!parent || !child || parent == child) {
        return false;
    }

    detach(childUuid);
    child->setParentUuid(parent->uuid());
    child->setParent(parent);
    if (index < 0) {
        return parent->appendChildUuid(child->uuid());
    }
    return parent->insertChildUuid(index, child->uuid());
}

bool QHTMLNodeTree::reparent(const std::string &childUuid, const std::string &parentUuid)
{
    return addChild(parentUuid, childUuid);
}

bool QHTMLNodeTree::detach(const std::string &childUuid)
{
    QHTMLElement *child = get(childUuid);
    if (!child) {
        return false;
    }

    if (QHTMLElement *parent = getByQString(child->parentUuid())) {
        parent->removeChildUuid(child->uuid());
    }
    child->setParentUuid(QString());
    child->setParent(nullptr);
    return true;
}

QHTMLContext *QHTMLNodeTree::contextFor(const std::string &uuid) const
{
    auto *context = new QHTMLContext;
    context->setOwnerUuid(jsToQString(uuid));
    m_contexts.append(context);

    const QHTMLElement *node = get(uuid);
    QSet<QString> visited;
    while (node && !visited.contains(node->uuid())) {
        visited.insert(node->uuid());
        const QVariantMap localSymbols = node->symbols();
        for (auto it = localSymbols.constBegin(); it != localSymbols.constEnd(); ++it) {
            if (!context->has(it.key())) {
                context->setSymbol(it.key(), it.value().toString());
            }
        }
        node = getByQString(node->parentUuid());
    }

    return context;
}

std::string QHTMLNodeTree::resolveSymbol(const std::string &fromUuid, const std::string &name) const
{
    QHTMLContext *context = contextFor(fromUuid);
    return context ? context->getUUID(name) : std::string();
}

bool QHTMLNodeTree::setSymbol(const std::string &ownerUuid, const std::string &name, const std::string &targetUuid)
{
    QHTMLElement *owner = get(ownerUuid);
    if (!owner) {
        return false;
    }
    owner->setSymbolJs(name, targetUuid);
    return true;
}

QHTMLBinding *QHTMLNodeTree::bindProperty(const std::string &sourceUuid,
                                          const std::string &sourceProperty,
                                          const std::string &targetUuid,
                                          const std::string &targetProperty)
{
    if (!get(sourceUuid) || !get(targetUuid)) {
        return nullptr;
    }

    auto *binding = new QHTMLBinding;
    binding->configureJs(sourceUuid, sourceProperty, targetUuid, targetProperty);
    m_bindings.insert(binding->uuid(), binding);
    syncBindingsFrom(sourceUuid, sourceProperty);
    return binding;
}

bool QHTMLNodeTree::removeBinding(const std::string &bindingUuid)
{
    QHTMLBinding *binding = m_bindings.take(jsToQString(bindingUuid));
    if (!binding) {
        return false;
    }
    delete binding;
    return true;
}

int QHTMLNodeTree::syncBindingsFrom(const std::string &sourceUuid, const std::string &sourceProperty)
{
    if (m_syncDepth > 64) {
        return 0;
    }

    QHTMLElement *source = get(sourceUuid);
    if (!source) {
        return 0;
    }

    const QString sourceId = source->uuid();
    const QString sourceProp = normalizeName(jsToQString(sourceProperty));
    const QVariant value = source->propertyVariant(sourceProp);
    int synced = 0;

    ++m_syncDepth;
    for (QHTMLBinding *binding : m_bindings) {
        if (!binding || !binding->enabled()) {
            continue;
        }
        if (binding->sourceUuid() != sourceId || binding->sourceProperty() != sourceProp) {
            continue;
        }
        QHTMLElement *target = getByQString(binding->targetUuid());
        if (!target) {
            continue;
        }
        target->setPropertyVariant(binding->targetProperty(), value, true);
        ++synced;
    }
    --m_syncDepth;
    return synced;
}

std::string QHTMLNodeTree::bindingsJson() const
{
    QVariantList out;
    for (const QHTMLBinding *binding : m_bindings) {
        if (binding) {
            out.append(binding->toVariantMap());
        }
    }
    return qToStd(variantToJson(out));
}

std::string QHTMLNodeTree::nodesJson() const
{
    QVariantList out;
    for (const QHTMLElement *node : m_nodes) {
        if (node) {
            out.append(node->toVariantMap());
        }
    }
    return qToStd(variantToJson(out));
}

std::string QHTMLNodeTree::toJsonJs() const
{
    QVariantMap out;
    out.insert(QStringLiteral("nodes"), jsonToVariant(QString::fromStdString(nodesJson())));
    out.insert(QStringLiteral("bindings"), jsonToVariant(QString::fromStdString(bindingsJson())));
    return qToStd(variantToJson(out));
}

void QHTMLNodeTree::notifyPropertyChanged(QHTMLElement *node,
                                          const QString &propertyName,
                                          const QVariant &value,
                                          const QVariant &previous)
{
    if (!node) {
        return;
    }

#ifdef __EMSCRIPTEN__
    node->dispatchPropertyChangedJs(qToStd(propertyName), variantToVal(value), variantToVal(previous));
#else
    Q_UNUSED(value)
    Q_UNUSED(previous)
#endif
    syncBindingsFrom(node->uuidJs(), qToStd(propertyName));
}

QHTMLPropertyAnimation::QHTMLPropertyAnimation(QObject *parent)
    : QObject(parent),
      m_animation(new QPropertyAnimation(&m_proxy, QByteArray(), this))
{
    connect(m_animation, &QPropertyAnimation::valueChanged, this, [this](const QVariant &value) {
        if (!m_tree || m_targetUuid.isEmpty() || m_propertyName.isEmpty()) {
            return;
        }
        if (QHTMLElement *target = m_tree->getByQString(m_targetUuid)) {
            target->setPropertyVariant(m_propertyName, value, true);
        }
    });
    connect(m_animation, &QPropertyAnimation::finished, this, [this]() {
        emitSignal(QStringLiteral("finished"));
    });
    connect(m_animation, &QAbstractAnimation::stateChanged, this,
            [this](QAbstractAnimation::State newState, QAbstractAnimation::State) {
        emitSignal(QStringLiteral("stateChanged"), static_cast<int>(newState));
    });
}

void QHTMLPropertyAnimation::setTree(QHTMLNodeTree *tree) { m_tree = tree; }
void QHTMLPropertyAnimation::setTargetTree(QHTMLNodeTree *tree) { setTree(tree); }
void QHTMLPropertyAnimation::setTargetUuid(const std::string &uuid) { m_targetUuid = jsToQString(uuid); }

void QHTMLPropertyAnimation::setPropertyName(const std::string &name)
{
    m_propertyName = normalizeName(jsToQString(name));
    m_animation->setPropertyName(m_propertyName.toUtf8());
}

void QHTMLPropertyAnimation::setDuration(int ms)
{
    m_animation->setDuration(qMax(0, ms));
}

void QHTMLPropertyAnimation::setStartNumber(double value)
{
    if (!m_propertyName.isEmpty()) {
        m_proxy.setProperty(m_propertyName.toUtf8().constData(), value);
    }
    m_animation->setStartValue(value);
}

void QHTMLPropertyAnimation::setEndNumber(double value)
{
    m_animation->setEndValue(value);
}

void QHTMLPropertyAnimation::setEasing(int easingType)
{
    m_animation->setEasingCurve(static_cast<QEasingCurve::Type>(easingType));
}

void QHTMLPropertyAnimation::start()
{
    m_animation->start();
    emitSignal(QStringLiteral("started"));
}

void QHTMLPropertyAnimation::stop()
{
    m_animation->stop();
    emitSignal(QStringLiteral("stopped"));
}

bool QHTMLPropertyAnimation::isRunning() const
{
    return m_animation->state() == QAbstractAnimation::Running;
}

#ifdef __EMSCRIPTEN__
int QHTMLPropertyAnimation::connectJs(const std::string &signalName, emscripten::val callback)
{
    if (callback.isUndefined() || callback.isNull()) {
        return 0;
    }
    JsSignalConnection connection;
    connection.id = m_nextConnectionId++;
    connection.signalName = normalizeName(jsToQString(signalName));
    connection.callback = callback;
    m_signalConnections.append(connection);
    return connection.id;
}

bool QHTMLPropertyAnimation::disconnectJs(int connectionId)
{
    for (int i = 0; i < m_signalConnections.size(); ++i) {
        if (m_signalConnections.at(i).id == connectionId) {
            m_signalConnections.removeAt(i);
            return true;
        }
    }
    return false;
}
#endif

void QHTMLPropertyAnimation::emitSignal(const QString &signalName, const QVariant &payload)
{
#ifdef __EMSCRIPTEN__
    const QList<JsSignalConnection> connections = m_signalConnections;
    for (const JsSignalConnection &connection : connections) {
        if (connection.signalName == signalName && !connection.callback.isUndefined() && !connection.callback.isNull()) {
            connection.callback(variantToVal(payload));
        }
    }
#else
    Q_UNUSED(signalName)
    Q_UNUSED(payload)
#endif
}
