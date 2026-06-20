#include "qhtml_qdom.h"

#include <QByteArray>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QJsonValue>
#include <QMetaType>
#include <QtGlobal>
#include <QUuid>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#endif

namespace {

QString createUuid()
{
    return QUuid::createUuid().toString(QUuid::WithoutBraces);
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

QVariantMap jsonToMap(const QString &json)
{
    const QVariant value = jsonToVariant(json);
    return value.toMap();
}

QVariantList jsonToList(const QString &json)
{
    const QVariant value = jsonToVariant(json);
    if (value.typeId() == QMetaType::QVariantList) {
        return value.toList();
    }
    if (value.typeId() == QMetaType::QVariantMap) {
        QVariantList wrapped;
        wrapped.append(value);
        return wrapped;
    }
    return QVariantList();
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

QString variantToString(const QVariant &value)
{
    if (value.typeId() == QMetaType::QVariantMap || value.typeId() == QMetaType::QVariantList ||
        value.typeId() == QMetaType::QStringList) {
        return variantToJson(value);
    }
    return value.toString();
}

QString jsToQString(const std::string &value)
{
    return QString::fromStdString(value);
}

std::string qToStd(const QString &value)
{
    return value.toStdString();
}

QStringList variantStringList(const QVariant &value)
{
    if (value.canConvert<QStringList>()) {
        return value.toStringList();
    }
    QStringList result;
    for (const QVariant &entry : value.toList()) {
        result.append(entry.toString());
    }
    return result;
}

QString selectorTagName(const QString &selector)
{
    int end = selector.size();
    const int idIndex = selector.indexOf(QLatin1Char('#'));
    const int classIndex = selector.indexOf(QLatin1Char('.'));
    if (idIndex >= 0) {
        end = qMin(end, idIndex);
    }
    if (classIndex >= 0) {
        end = qMin(end, classIndex);
    }
    const QString tag = selector.left(end).trimmed();
    return tag.isEmpty() ? selector.trimmed() : tag;
}

void applySelectorAttributes(QDomElementNode *node, const QString &selector)
{
    if (!node) {
        return;
    }

    const int idIndex = selector.indexOf(QLatin1Char('#'));
    if (idIndex >= 0) {
        int end = selector.size();
        const int classAfterId = selector.indexOf(QLatin1Char('.'), idIndex);
        if (classAfterId >= 0) {
            end = classAfterId;
        }
        const QString id = selector.mid(idIndex + 1, end - idIndex - 1).trimmed();
        if (!id.isEmpty()) {
            node->setAttribute(QStringLiteral("id"), id);
        }
    }

    QStringList classes;
    int classIndex = selector.indexOf(QLatin1Char('.'));
    while (classIndex >= 0) {
        int end = selector.indexOf(QLatin1Char('.'), classIndex + 1);
        if (end < 0) {
            end = selector.size();
        }
        const QString className = selector.mid(classIndex + 1, end - classIndex - 1).trimmed();
        if (!className.isEmpty()) {
            classes.append(className);
        }
        classIndex = selector.indexOf(QLatin1Char('.'), end);
    }
    if (!classes.isEmpty()) {
        node->setAttribute(QStringLiteral("class"), classes.join(QLatin1Char(' ')));
    }
}

QVariantMap commonDefinitionPayload(const QVariantMap &item)
{
    QVariantMap payload = item;
    payload.remove(QStringLiteral("items"));
    return payload;
}

QString compactParameterSource(const QVariant &value)
{
    if (value.typeId() == QMetaType::QString) {
        return value.toString();
    }
    return variantToJson(value);
}

QString slotNameFromElementItem(const QVariantMap &item)
{
    const QVariantList items = item.value(QStringLiteral("items")).toList();
    for (const QVariant &entry : items) {
        const QVariantMap child = entry.toMap();
        const QString type = child.value(QStringLiteral("type")).toString();
        if (type == QLatin1String("TextBlock") || type == QLatin1String("RawTextLine")) {
            const QString name = child.value(QStringLiteral("text")).toString().trimmed();
            if (!name.isEmpty()) {
                return name;
            }
        }
    }
    return item.value(QStringLiteral("instanceAlias")).toString();
}

} // namespace

QDomNode::QDomNode(const QString &kind, QObject *parent)
    : QObject(parent),
      m_kind(kind.isEmpty() ? QStringLiteral("node") : kind),
      m_uuid(createUuid())
{
}

QDomNode::QDomNode(const std::string &kind)
    : QDomNode(jsToQString(kind), nullptr)
{
}

QString QDomNode::kind() const { return m_kind; }
std::string QDomNode::kindJs() const { return qToStd(kind()); }

std::string QDomNode::objectNameJs() const { return qToStd(objectName()); }
void QDomNode::setObjectNameJs(const std::string &name) { setObjectName(jsToQString(name)); }

QDomNode *QDomNode::parentNode() const
{
    return dynamic_cast<QDomNode *>(parent());
}

void QDomNode::setParentNode(QDomNode *parent)
{
    if (parent) {
        parent->addChild(this);
        return;
    }

    if (auto *oldParent = parentNode()) {
        oldParent->removeChild(this);
        return;
    }

    setParent(nullptr);
}

QString QDomNode::uuid() const { return m_uuid; }
std::string QDomNode::uuidJs() const { return qToStd(uuid()); }
void QDomNode::setUuid(const QString &uuid) { m_uuid = uuid; }
void QDomNode::setUuidJs(const std::string &uuid) { setUuid(jsToQString(uuid)); }

QString QDomNode::domUuid() const { return m_domUuid; }
std::string QDomNode::domUuidJs() const { return qToStd(domUuid()); }
void QDomNode::setDomUuid(const QString &uuid) { m_domUuid = uuid; }
void QDomNode::setDomUuidJs(const std::string &uuid) { setDomUuid(jsToQString(uuid)); }

void QDomNode::addChild(QDomNode *node)
{
    insertChild(m_childNodes.size(), node);
}

void QDomNode::insertChild(int index, QDomNode *node)
{
    if (!node || node == this) {
        return;
    }

    if (auto *oldParent = dynamic_cast<QDomNode *>(node->parent())) {
        oldParent->removeChild(node);
    }

    if (m_childNodes.contains(node)) {
        m_childNodes.removeAll(node);
    }

    const int boundedIndex = qBound(0, index, m_childNodes.size());
    m_childNodes.insert(boundedIndex, node);
    node->setParent(this);
}

bool QDomNode::removeChild(QDomNode *node)
{
    if (!node) {
        return false;
    }
    const bool removed = m_childNodes.removeOne(node);
    if (removed && node->parent() == this) {
        node->setParent(nullptr);
    }
    return removed;
}

QDomNode *QDomNode::childAt(int index) const
{
    if (index < 0 || index >= m_childNodes.size()) {
        return nullptr;
    }
    return m_childNodes.at(index);
}

int QDomNode::childCount() const
{
    return m_childNodes.size();
}

std::string QDomNode::childrenJson() const
{
    QVariantList items;
    for (const QDomNode *child : m_childNodes) {
        if (child) {
            items.append(child->toVariantMap());
        }
    }
    return qToStd(variantToJson(items));
}

QDomNode *QDomNode::findByUuid(const QString &uuid) const
{
    if (m_uuid == uuid) {
        return const_cast<QDomNode *>(this);
    }
    for (QDomNode *child : m_childNodes) {
        if (QDomNode *match = child ? child->findByUuid(uuid) : nullptr) {
            return match;
        }
    }
    return nullptr;
}

QDomNode *QDomNode::findByUuidJs(const std::string &uuid) const { return findByUuid(jsToQString(uuid)); }

QDomNode *QDomNode::findByKind(const QString &kind) const
{
    if (m_kind == kind) {
        return const_cast<QDomNode *>(this);
    }
    for (QDomNode *child : m_childNodes) {
        if (QDomNode *match = child ? child->findByKind(kind) : nullptr) {
            return match;
        }
    }
    return nullptr;
}

QDomNode *QDomNode::findByKindJs(const std::string &kind) const { return findByKind(jsToQString(kind)); }

QDomNode *QDomNode::findByName(const QString &name) const
{
    const QStringList keys = {
        QStringLiteral("name"),
        QStringLiteral("alias"),
        QStringLiteral("componentId"),
        QStringLiteral("classId"),
        QStringLiteral("structId"),
        QStringLiteral("tagName"),
    };
    const QVariantMap payload = toVariantMap();
    for (const QString &key : keys) {
        if (payload.value(key).toString() == name) {
            return const_cast<QDomNode *>(this);
        }
    }
    for (QDomNode *child : m_childNodes) {
        if (QDomNode *match = child ? child->findByName(name) : nullptr) {
            return match;
        }
    }
    return nullptr;
}

QDomNode *QDomNode::findByNameJs(const std::string &name) const { return findByName(jsToQString(name)); }

QDomNode *QDomNode::findByTagName(const QString &tagName) const
{
    const QVariantMap payload = toVariantMap();
    if (payload.value(QStringLiteral("tagName")).toString() == tagName) {
        return const_cast<QDomNode *>(this);
    }
    for (QDomNode *child : m_childNodes) {
        if (QDomNode *match = child ? child->findByTagName(tagName) : nullptr) {
            return match;
        }
    }
    return nullptr;
}

QDomNode *QDomNode::findByTagNameJs(const std::string &tagName) const { return findByTagName(jsToQString(tagName)); }

QDomNode *QDomNode::find(const QString &query) const
{
    if (QDomNode *match = findByUuid(query)) {
        return match;
    }
    if (QDomNode *match = findByName(query)) {
        return match;
    }
    if (QDomNode *match = findByTagName(query)) {
        return match;
    }
    return findByKind(query);
}

QDomNode *QDomNode::findJs(const std::string &query) const
{
    return find(jsToQString(query));
}

void QDomNode::setMetaValue(const QString &name, const QVariant &value) { m_meta.insert(name, value); }
void QDomNode::setMetaValueJs(const std::string &name, const std::string &value) { setMetaValue(jsToQString(name), jsToQString(value)); }
QString QDomNode::metaValue(const QString &name) const { return variantToString(m_meta.value(name)); }
std::string QDomNode::metaValueJs(const std::string &name) const { return qToStd(metaValue(jsToQString(name))); }
QString QDomNode::metaJson() const { return variantToJson(m_meta); }
std::string QDomNode::metaJsonJs() const { return qToStd(metaJson()); }
void QDomNode::setMetaJson(const QString &json) { m_meta = jsonToMap(json); }
void QDomNode::setMetaJsonJs(const std::string &json) { setMetaJson(jsToQString(json)); }

void QDomNode::setStringProperty(const std::string &name, const std::string &value)
{
    setProperty(name.c_str(), jsToQString(value));
}

void QDomNode::setNumberProperty(const std::string &name, double value)
{
    setProperty(name.c_str(), value);
}

void QDomNode::setBoolProperty(const std::string &name, bool value)
{
    setProperty(name.c_str(), value);
}

std::string QDomNode::stringProperty(const std::string &name) const
{
    return qToStd(property(name.c_str()).toString());
}

double QDomNode::numberProperty(const std::string &name) const
{
    return property(name.c_str()).toDouble();
}

bool QDomNode::boolProperty(const std::string &name) const
{
    return property(name.c_str()).toBool();
}

bool QDomNode::hasProperty(const std::string &name) const
{
    return property(name.c_str()).isValid();
}

std::string QDomNode::propertyJson(const std::string &name) const
{
    return qToStd(variantToJson(property(name.c_str())));
}

std::string QDomNode::propertyKeysJson() const
{
    QStringList keys;
    for (const QByteArray &name : dynamicPropertyNames()) {
        keys.append(QString::fromUtf8(name));
    }
    return qToStd(variantToJson(keys));
}

QVariantMap QDomNode::toVariantMap() const
{
    QVariantMap out;
    out.insert(QStringLiteral("kind"), m_kind);
    out.insert(QStringLiteral("uuid"), m_uuid);
    if (!m_domUuid.isEmpty()) {
        out.insert(QStringLiteral("domUuid"), m_domUuid);
    }
    if (!m_meta.isEmpty()) {
        out.insert(QStringLiteral("meta"), m_meta);
    }

    QVariantMap dynamicProperties;
    for (const QByteArray &name : dynamicPropertyNames()) {
        dynamicProperties.insert(QString::fromUtf8(name), property(name.constData()));
    }
    if (!dynamicProperties.isEmpty()) {
        out.insert(QStringLiteral("properties"), dynamicProperties);
    }

    writePayload(out);

    QVariantList items;
    for (const QDomNode *child : m_childNodes) {
        if (child) {
            items.append(child->toVariantMap());
        }
    }
    if (!items.isEmpty()) {
        out.insert(QStringLiteral("children"), items);
    }
    return out;
}

QString QDomNode::toJson() const
{
    return variantToJson(toVariantMap());
}

std::string QDomNode::toJsonJs() const
{
    return qToStd(toJson());
}

#ifdef __EMSCRIPTEN__
void QDomNode::setPropertyValueJs(const std::string &name, emscripten::val value)
{
    if (value.isUndefined()) {
        setProperty(name.c_str(), QVariant());
        return;
    }

    const std::string json = emscripten::val::global("JSON").call<std::string>("stringify", value);
    setProperty(name.c_str(), jsonToVariant(jsToQString(json)));
}

emscripten::val QDomNode::propertyValueJs(const std::string &name) const
{
    return emscripten::val::global("JSON").call<emscripten::val>("parse", propertyJson(name));
}

int QDomNode::connectJs(const std::string &signalName, emscripten::val callback)
{
    if (callback.isUndefined() || callback.isNull()) {
        return 0;
    }

    JsSignalConnection connection;
    connection.id = m_nextConnectionId++;
    connection.signalName = jsToQString(signalName);
    connection.callback = callback;
    m_signalConnections.append(connection);
    return connection.id;
}

bool QDomNode::disconnectJs(int connectionId)
{
    for (int i = 0; i < m_signalConnections.size(); ++i) {
        if (m_signalConnections.at(i).id == connectionId) {
            m_signalConnections.removeAt(i);
            return true;
        }
    }
    return false;
}

void QDomNode::emitJs(const std::string &signalName, emscripten::val payload)
{
    const QString key = jsToQString(signalName);
    const QList<JsSignalConnection> connections = m_signalConnections;
    for (const JsSignalConnection &connection : connections) {
        if (connection.signalName == key && !connection.callback.isUndefined() && !connection.callback.isNull()) {
            connection.callback(payload);
        }
    }
}

emscripten::val QDomNode::toObjectJs() const
{
    return emscripten::val::global("JSON").call<emscripten::val>("parse", toJsonJs());
}
#endif

void QDomNode::setKindForSubclass(const QString &kind) { m_kind = kind; }
void QDomNode::writePayload(QVariantMap &) const {}
const QList<QDomNode *> &QDomNode::childNodes() const { return m_childNodes; }

QDomDocumentNode::QDomDocumentNode(const QString &source, QObject *parent)
    : QDomNode(QStringLiteral("document"), parent), m_source(source)
{
}

QDomDocumentNode::QDomDocumentNode(const std::string &source)
    : QDomDocumentNode(jsToQString(source), nullptr)
{
}

QString QDomDocumentNode::source() const { return m_source; }
std::string QDomDocumentNode::sourceJs() const { return qToStd(source()); }
void QDomDocumentNode::setSource(const QString &source) { m_source = source; }
void QDomDocumentNode::setSourceJs(const std::string &source) { setSource(jsToQString(source)); }
void QDomDocumentNode::writePayload(QVariantMap &out) const { out.insert(QStringLiteral("source"), m_source); }

QDomElementNode::QDomElementNode(const QString &tagName, QObject *parent)
    : QDomNode(QStringLiteral("element"), parent), m_tagName(tagName)
{
}

QDomElementNode::QDomElementNode(const std::string &tagName)
    : QDomElementNode(jsToQString(tagName), nullptr)
{
}

QString QDomElementNode::tagName() const { return m_tagName; }
std::string QDomElementNode::tagNameJs() const { return qToStd(tagName()); }
void QDomElementNode::setTagName(const QString &tagName) { m_tagName = tagName; }
void QDomElementNode::setTagNameJs(const std::string &tagName) { setTagName(jsToQString(tagName)); }
void QDomElementNode::setSelectorChain(const QStringList &selectors) { m_selectorChain = selectors; }
QString QDomElementNode::selectorChainJson() const { return variantToJson(m_selectorChain); }
std::string QDomElementNode::selectorChainJsonJs() const { return qToStd(selectorChainJson()); }
void QDomElementNode::setAttribute(const QString &name, const QVariant &value) { m_attributes.insert(name, value); }
void QDomElementNode::setAttributeJs(const std::string &name, const std::string &value) { setAttribute(jsToQString(name), jsToQString(value)); }
QString QDomElementNode::attribute(const QString &name) const { return variantToString(m_attributes.value(name)); }
std::string QDomElementNode::attributeJs(const std::string &name) const { return qToStd(attribute(jsToQString(name))); }
bool QDomElementNode::hasAttribute(const QString &name) const { return m_attributes.contains(name); }
bool QDomElementNode::hasAttributeJs(const std::string &name) const { return hasAttribute(jsToQString(name)); }
QString QDomElementNode::attributesJson() const { return variantToJson(m_attributes); }
std::string QDomElementNode::attributesJsonJs() const { return qToStd(attributesJson()); }
void QDomElementNode::setTextContent(const QString &value) { m_textContent = value; }
void QDomElementNode::setTextContentJs(const std::string &value) { setTextContent(jsToQString(value)); }
QString QDomElementNode::textContent() const { return m_textContent; }
std::string QDomElementNode::textContentJs() const { return qToStd(textContent()); }
void QDomElementNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("tagName"), m_tagName);
    if (!m_selectorChain.isEmpty()) {
        out.insert(QStringLiteral("selectorChain"), m_selectorChain);
    }
    if (!m_attributes.isEmpty()) {
        out.insert(QStringLiteral("attributes"), m_attributes);
    }
    if (!m_textContent.isEmpty()) {
        out.insert(QStringLiteral("textContent"), m_textContent);
    }
}

QDomTextNode::QDomTextNode(const QString &value, QObject *parent)
    : QDomNode(QStringLiteral("text"), parent), m_value(value)
{
}

QDomTextNode::QDomTextNode(const std::string &value)
    : QDomTextNode(jsToQString(value), nullptr)
{
}

QString QDomTextNode::value() const { return m_value; }
std::string QDomTextNode::valueJs() const { return qToStd(value()); }
void QDomTextNode::setValue(const QString &value) { m_value = value; }
void QDomTextNode::setValueJs(const std::string &value) { setValue(jsToQString(value)); }
void QDomTextNode::writePayload(QVariantMap &out) const { out.insert(QStringLiteral("value"), m_value); }

QDomRawHtmlNode::QDomRawHtmlNode(const QString &html, QObject *parent)
    : QDomNode(QStringLiteral("raw-html"), parent), m_html(html)
{
}

QDomRawHtmlNode::QDomRawHtmlNode(const std::string &html)
    : QDomRawHtmlNode(jsToQString(html), nullptr)
{
}

QString QDomRawHtmlNode::html() const { return m_html; }
std::string QDomRawHtmlNode::htmlJs() const { return qToStd(html()); }
void QDomRawHtmlNode::setHtml(const QString &html) { m_html = html; }
void QDomRawHtmlNode::setHtmlJs(const std::string &html) { setHtml(jsToQString(html)); }
void QDomRawHtmlNode::writePayload(QVariantMap &out) const { out.insert(QStringLiteral("html"), m_html); }

QDomModelNode::QDomModelNode(const QString &name, QObject *parent)
    : QDomNode(QStringLiteral("model"), parent), m_name(name)
{
}

QDomModelNode::QDomModelNode(const std::string &name)
    : QDomModelNode(jsToQString(name), nullptr)
{
}

QString QDomModelNode::name() const { return m_name; }
std::string QDomModelNode::nameJs() const { return qToStd(name()); }
void QDomModelNode::setName(const QString &name) { m_name = name; }
void QDomModelNode::setNameJs(const std::string &name) { setName(jsToQString(name)); }
void QDomModelNode::setEntriesJson(const QString &json) { m_entries = jsonToList(json); }
void QDomModelNode::setEntriesJsonJs(const std::string &json) { setEntriesJson(jsToQString(json)); }
QString QDomModelNode::entriesJson() const { return variantToJson(m_entries); }
std::string QDomModelNode::entriesJsonJs() const { return qToStd(entriesJson()); }
void QDomModelNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("name"), m_name);
    if (!m_entries.isEmpty()) {
        out.insert(QStringLiteral("entries"), m_entries);
    }
}

QDomRepeaterNode::QDomRepeaterNode(const QString &repeaterId, QObject *parent)
    : QDomNode(QStringLiteral("repeater"), parent), m_repeaterId(repeaterId)
{
}

QDomRepeaterNode::QDomRepeaterNode(const std::string &repeaterId)
    : QDomRepeaterNode(jsToQString(repeaterId), nullptr)
{
}

QString QDomRepeaterNode::repeaterId() const { return m_repeaterId; }
std::string QDomRepeaterNode::repeaterIdJs() const { return qToStd(repeaterId()); }
void QDomRepeaterNode::setRepeaterId(const QString &repeaterId) { m_repeaterId = repeaterId; }
void QDomRepeaterNode::setRepeaterIdJs(const std::string &repeaterId) { setRepeaterId(jsToQString(repeaterId)); }
QString QDomRepeaterNode::modelRef() const { return m_modelRef; }
std::string QDomRepeaterNode::modelRefJs() const { return qToStd(modelRef()); }
void QDomRepeaterNode::setModelRef(const QString &modelRef) { m_modelRef = modelRef; }
void QDomRepeaterNode::setModelRefJs(const std::string &modelRef) { setModelRef(jsToQString(modelRef)); }
void QDomRepeaterNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("repeaterId"), m_repeaterId);
    if (!m_modelRef.isEmpty()) {
        out.insert(QStringLiteral("modelRef"), m_modelRef);
    }
}

QDomComponentNode::QDomComponentNode(const QString &componentId, QObject *parent)
    : QDomNode(QStringLiteral("component"), parent), m_componentId(componentId)
{
}

QDomComponentNode::QDomComponentNode(const std::string &componentId)
    : QDomComponentNode(jsToQString(componentId), nullptr)
{
}

QString QDomComponentNode::componentId() const { return m_componentId; }
std::string QDomComponentNode::componentIdJs() const { return qToStd(componentId()); }
void QDomComponentNode::setComponentId(const QString &componentId) { m_componentId = componentId; }
void QDomComponentNode::setComponentIdJs(const std::string &componentId) { setComponentId(jsToQString(componentId)); }
QString QDomComponentNode::definitionType() const { return m_definitionType; }
std::string QDomComponentNode::definitionTypeJs() const { return qToStd(definitionType()); }
void QDomComponentNode::setDefinitionType(const QString &definitionType) { m_definitionType = definitionType; }
void QDomComponentNode::setDefinitionTypeJs(const std::string &definitionType) { setDefinitionType(jsToQString(definitionType)); }
void QDomComponentNode::setDefinitionJson(const QString &json) { m_definition = jsonToMap(json); }
void QDomComponentNode::setDefinitionJsonJs(const std::string &json) { setDefinitionJson(jsToQString(json)); }
QString QDomComponentNode::definitionJson() const { return variantToJson(m_definition); }
std::string QDomComponentNode::definitionJsonJs() const { return qToStd(definitionJson()); }
void QDomComponentNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("componentId"), m_componentId);
    if (!m_definitionType.isEmpty()) {
        out.insert(QStringLiteral("definitionType"), m_definitionType);
    }
    if (!m_definition.isEmpty()) {
        out.insert(QStringLiteral("definition"), m_definition);
    }
}

QDomComponentInstanceNode::QDomComponentInstanceNode(const QString &componentId, QObject *parent)
    : QDomNode(QStringLiteral("component-instance"), parent), m_componentId(componentId)
{
}

QDomComponentInstanceNode::QDomComponentInstanceNode(const std::string &componentId)
    : QDomComponentInstanceNode(jsToQString(componentId), nullptr)
{
}

QString QDomComponentInstanceNode::componentId() const { return m_componentId; }
std::string QDomComponentInstanceNode::componentIdJs() const { return qToStd(componentId()); }
void QDomComponentInstanceNode::setComponentId(const QString &componentId) { m_componentId = componentId; }
void QDomComponentInstanceNode::setComponentIdJs(const std::string &componentId) { setComponentId(jsToQString(componentId)); }
QString QDomComponentInstanceNode::alias() const { return m_alias; }
std::string QDomComponentInstanceNode::aliasJs() const { return qToStd(alias()); }
void QDomComponentInstanceNode::setAlias(const QString &alias) { m_alias = alias; }
void QDomComponentInstanceNode::setAliasJs(const std::string &alias) { setAlias(jsToQString(alias)); }
void QDomComponentInstanceNode::setAttribute(const QString &name, const QVariant &value) { m_attributes.insert(name, value); }
void QDomComponentInstanceNode::setAttributeJs(const std::string &name, const std::string &value) { setAttribute(jsToQString(name), jsToQString(value)); }
QString QDomComponentInstanceNode::attribute(const QString &name) const { return variantToString(m_attributes.value(name)); }
std::string QDomComponentInstanceNode::attributeJs(const std::string &name) const { return qToStd(attribute(jsToQString(name))); }
QString QDomComponentInstanceNode::attributesJson() const { return variantToJson(m_attributes); }
std::string QDomComponentInstanceNode::attributesJsonJs() const { return qToStd(attributesJson()); }
void QDomComponentInstanceNode::setProp(const QString &name, const QVariant &value) { m_props.insert(name, value); }
void QDomComponentInstanceNode::setPropJs(const std::string &name, const std::string &value) { setProp(jsToQString(name), jsToQString(value)); }
QString QDomComponentInstanceNode::prop(const QString &name) const { return variantToString(m_props.value(name)); }
std::string QDomComponentInstanceNode::propJs(const std::string &name) const { return qToStd(prop(jsToQString(name))); }
QString QDomComponentInstanceNode::propsJson() const { return variantToJson(m_props); }
std::string QDomComponentInstanceNode::propsJsonJs() const { return qToStd(propsJson()); }
void QDomComponentInstanceNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("componentId"), m_componentId);
    if (!m_alias.isEmpty()) {
        out.insert(QStringLiteral("alias"), m_alias);
    }
    if (!m_attributes.isEmpty()) {
        out.insert(QStringLiteral("attributes"), m_attributes);
    }
    if (!m_props.isEmpty()) {
        out.insert(QStringLiteral("props"), m_props);
    }
}

QDomTemplateInstanceNode::QDomTemplateInstanceNode(const QString &templateId, QObject *parent)
    : QDomComponentInstanceNode(templateId, parent)
{
    setKindForSubclass(QStringLiteral("template-instance"));
    setMetaValue(QStringLiteral("templateInstance"), true);
}

QDomTemplateInstanceNode::QDomTemplateInstanceNode(const std::string &templateId)
    : QDomTemplateInstanceNode(jsToQString(templateId), nullptr)
{
}

QDomStructNode::QDomStructNode(const QString &structId, QObject *parent)
    : QDomNode(QStringLiteral("struct"), parent), m_structId(structId)
{
}

QDomStructNode::QDomStructNode(const std::string &structId)
    : QDomStructNode(jsToQString(structId), nullptr)
{
}

QString QDomStructNode::structId() const { return m_structId; }
std::string QDomStructNode::structIdJs() const { return qToStd(structId()); }
void QDomStructNode::setStructId(const QString &structId) { m_structId = structId; }
void QDomStructNode::setStructIdJs(const std::string &structId) { setStructId(jsToQString(structId)); }
void QDomStructNode::setFieldsJson(const QString &json) { m_fields = jsonToList(json); }
void QDomStructNode::setFieldsJsonJs(const std::string &json) { setFieldsJson(jsToQString(json)); }
QString QDomStructNode::fieldsJson() const { return variantToJson(m_fields); }
std::string QDomStructNode::fieldsJsonJs() const { return qToStd(fieldsJson()); }
void QDomStructNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("structId"), m_structId);
    if (!m_fields.isEmpty()) {
        out.insert(QStringLiteral("fields"), m_fields);
    }
}

QDomStructInstanceNode::QDomStructInstanceNode(const QString &structId, QObject *parent)
    : QDomNode(QStringLiteral("struct-instance"), parent), m_structId(structId)
{
}

QDomStructInstanceNode::QDomStructInstanceNode(const std::string &structId)
    : QDomStructInstanceNode(jsToQString(structId), nullptr)
{
}

QString QDomStructInstanceNode::structId() const { return m_structId; }
std::string QDomStructInstanceNode::structIdJs() const { return qToStd(structId()); }
void QDomStructInstanceNode::setStructId(const QString &structId) { m_structId = structId; }
void QDomStructInstanceNode::setStructIdJs(const std::string &structId) { setStructId(jsToQString(structId)); }
QString QDomStructInstanceNode::alias() const { return m_alias; }
std::string QDomStructInstanceNode::aliasJs() const { return qToStd(alias()); }
void QDomStructInstanceNode::setAlias(const QString &alias) { m_alias = alias; }
void QDomStructInstanceNode::setAliasJs(const std::string &alias) { setAlias(jsToQString(alias)); }
void QDomStructInstanceNode::setProp(const QString &name, const QVariant &value) { m_props.insert(name, value); }
void QDomStructInstanceNode::setPropJs(const std::string &name, const std::string &value) { setProp(jsToQString(name), jsToQString(value)); }
QString QDomStructInstanceNode::prop(const QString &name) const { return variantToString(m_props.value(name)); }
std::string QDomStructInstanceNode::propJs(const std::string &name) const { return qToStd(prop(jsToQString(name))); }
QString QDomStructInstanceNode::propsJson() const { return variantToJson(m_props); }
std::string QDomStructInstanceNode::propsJsonJs() const { return qToStd(propsJson()); }
void QDomStructInstanceNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("structId"), m_structId);
    if (!m_alias.isEmpty()) {
        out.insert(QStringLiteral("alias"), m_alias);
    }
    if (!m_props.isEmpty()) {
        out.insert(QStringLiteral("props"), m_props);
    }
}

QDomClassNode::QDomClassNode(const QString &classId, QObject *parent)
    : QDomNode(QStringLiteral("class"), parent), m_classId(classId)
{
}

QDomClassNode::QDomClassNode(const std::string &classId)
    : QDomClassNode(jsToQString(classId), nullptr)
{
}

QString QDomClassNode::classId() const { return m_classId; }
std::string QDomClassNode::classIdJs() const { return qToStd(classId()); }
void QDomClassNode::setClassId(const QString &classId) { m_classId = classId; }
void QDomClassNode::setClassIdJs(const std::string &classId) { setClassId(jsToQString(classId)); }
QString QDomClassNode::extendsClassId() const { return m_extendsClassId; }
std::string QDomClassNode::extendsClassIdJs() const { return qToStd(extendsClassId()); }
void QDomClassNode::setExtendsClassId(const QString &extendsClassId) { m_extendsClassId = extendsClassId; }
void QDomClassNode::setExtendsClassIdJs(const std::string &extendsClassId) { setExtendsClassId(jsToQString(extendsClassId)); }
void QDomClassNode::setConstructorJson(const QString &json) { m_constructorDefinition = jsonToMap(json); }
void QDomClassNode::setConstructorJsonJs(const std::string &json) { setConstructorJson(jsToQString(json)); }
QString QDomClassNode::constructorJson() const { return variantToJson(m_constructorDefinition); }
std::string QDomClassNode::constructorJsonJs() const { return qToStd(constructorJson()); }
void QDomClassNode::setMethodsJson(const QString &json) { m_methods = jsonToList(json); }
void QDomClassNode::setMethodsJsonJs(const std::string &json) { setMethodsJson(jsToQString(json)); }
QString QDomClassNode::methodsJson() const { return variantToJson(m_methods); }
std::string QDomClassNode::methodsJsonJs() const { return qToStd(methodsJson()); }
void QDomClassNode::setSlotDeclarationsJson(const QString &json) { m_slotDeclarations = jsonToList(json); }
void QDomClassNode::setSlotDeclarationsJsonJs(const std::string &json) { setSlotDeclarationsJson(jsToQString(json)); }
QString QDomClassNode::slotDeclarationsJson() const { return variantToJson(m_slotDeclarations); }
std::string QDomClassNode::slotDeclarationsJsonJs() const { return qToStd(slotDeclarationsJson()); }
void QDomClassNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("classId"), m_classId);
    if (!m_extendsClassId.isEmpty()) {
        out.insert(QStringLiteral("extendsClassId"), m_extendsClassId);
    }
    if (!m_constructorDefinition.isEmpty()) {
        out.insert(QStringLiteral("constructorDefinition"), m_constructorDefinition);
    }
    if (!m_methods.isEmpty()) {
        out.insert(QStringLiteral("methods"), m_methods);
    }
    if (!m_slotDeclarations.isEmpty()) {
        out.insert(QStringLiteral("slotDeclarations"), m_slotDeclarations);
    }
}

QDomClassInstanceNode::QDomClassInstanceNode(const QString &classId, QObject *parent)
    : QDomNode(QStringLiteral("class-instance"), parent), m_classId(classId)
{
}

QDomClassInstanceNode::QDomClassInstanceNode(const std::string &classId)
    : QDomClassInstanceNode(jsToQString(classId), nullptr)
{
}

QString QDomClassInstanceNode::classId() const { return m_classId; }
std::string QDomClassInstanceNode::classIdJs() const { return qToStd(classId()); }
void QDomClassInstanceNode::setClassId(const QString &classId) { m_classId = classId; }
void QDomClassInstanceNode::setClassIdJs(const std::string &classId) { setClassId(jsToQString(classId)); }
QString QDomClassInstanceNode::alias() const { return m_alias; }
std::string QDomClassInstanceNode::aliasJs() const { return qToStd(alias()); }
void QDomClassInstanceNode::setAlias(const QString &alias) { m_alias = alias; }
void QDomClassInstanceNode::setAliasJs(const std::string &alias) { setAlias(jsToQString(alias)); }
QString QDomClassInstanceNode::argumentSource() const { return m_argumentSource; }
std::string QDomClassInstanceNode::argumentSourceJs() const { return qToStd(argumentSource()); }
void QDomClassInstanceNode::setArgumentSource(const QString &argumentSource) { m_argumentSource = argumentSource; }
void QDomClassInstanceNode::setArgumentSourceJs(const std::string &argumentSource) { setArgumentSource(jsToQString(argumentSource)); }
void QDomClassInstanceNode::setArguments(const QStringList &arguments) { m_arguments = arguments; }
QString QDomClassInstanceNode::argumentsJson() const { return variantToJson(m_arguments); }
std::string QDomClassInstanceNode::argumentsJsonJs() const { return qToStd(argumentsJson()); }
void QDomClassInstanceNode::setAttribute(const QString &name, const QVariant &value) { m_attributes.insert(name, value); }
void QDomClassInstanceNode::setAttributeJs(const std::string &name, const std::string &value) { setAttribute(jsToQString(name), jsToQString(value)); }
QString QDomClassInstanceNode::attribute(const QString &name) const { return variantToString(m_attributes.value(name)); }
std::string QDomClassInstanceNode::attributeJs(const std::string &name) const { return qToStd(attribute(jsToQString(name))); }
QString QDomClassInstanceNode::attributesJson() const { return variantToJson(m_attributes); }
std::string QDomClassInstanceNode::attributesJsonJs() const { return qToStd(attributesJson()); }
void QDomClassInstanceNode::setProp(const QString &name, const QVariant &value) { m_props.insert(name, value); }
void QDomClassInstanceNode::setPropJs(const std::string &name, const std::string &value) { setProp(jsToQString(name), jsToQString(value)); }
QString QDomClassInstanceNode::prop(const QString &name) const { return variantToString(m_props.value(name)); }
std::string QDomClassInstanceNode::propJs(const std::string &name) const { return qToStd(prop(jsToQString(name))); }
QString QDomClassInstanceNode::propsJson() const { return variantToJson(m_props); }
std::string QDomClassInstanceNode::propsJsonJs() const { return qToStd(propsJson()); }
void QDomClassInstanceNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("classId"), m_classId);
    if (!m_alias.isEmpty()) {
        out.insert(QStringLiteral("alias"), m_alias);
    }
    if (!m_argumentSource.isEmpty()) {
        out.insert(QStringLiteral("argumentSource"), m_argumentSource);
    }
    if (!m_arguments.isEmpty()) {
        out.insert(QStringLiteral("arguments"), m_arguments);
    }
    if (!m_attributes.isEmpty()) {
        out.insert(QStringLiteral("attributes"), m_attributes);
    }
    if (!m_props.isEmpty()) {
        out.insert(QStringLiteral("props"), m_props);
    }
}

QDomSlotNode::QDomSlotNode(const QString &name, QObject *parent)
    : QDomNode(QStringLiteral("slot"), parent), m_name(name)
{
}

QDomSlotNode::QDomSlotNode(const std::string &name)
    : QDomSlotNode(jsToQString(name), nullptr)
{
}

QString QDomSlotNode::name() const { return m_name; }
std::string QDomSlotNode::nameJs() const { return qToStd(name()); }
void QDomSlotNode::setName(const QString &name) { m_name = name; }
void QDomSlotNode::setNameJs(const std::string &name) { setName(jsToQString(name)); }
void QDomSlotNode::writePayload(QVariantMap &out) const { out.insert(QStringLiteral("name"), m_name); }

QDomSlotDefaultNode::QDomSlotDefaultNode(const QString &name, QObject *parent)
    : QDomSlotNode(name, parent)
{
    setKindForSubclass(QStringLiteral("slot-default"));
    setMetaValue(QStringLiteral("slotDefault"), true);
}

QDomSlotDefaultNode::QDomSlotDefaultNode(const std::string &name)
    : QDomSlotDefaultNode(jsToQString(name), nullptr)
{
}

QDomScriptRuleNode::QDomScriptRuleNode(const QString &name, QObject *parent)
    : QDomNode(QStringLiteral("script-rule"), parent), m_name(name)
{
}

QDomScriptRuleNode::QDomScriptRuleNode(const std::string &name)
    : QDomScriptRuleNode(jsToQString(name), nullptr)
{
}

QString QDomScriptRuleNode::name() const { return m_name; }
std::string QDomScriptRuleNode::nameJs() const { return qToStd(name()); }
void QDomScriptRuleNode::setName(const QString &name) { m_name = name; }
void QDomScriptRuleNode::setNameJs(const std::string &name) { setName(jsToQString(name)); }
QString QDomScriptRuleNode::parameters() const { return m_parameters; }
std::string QDomScriptRuleNode::parametersJs() const { return qToStd(parameters()); }
void QDomScriptRuleNode::setParameters(const QString &parameters) { m_parameters = parameters; }
void QDomScriptRuleNode::setParametersJs(const std::string &parameters) { setParameters(jsToQString(parameters)); }
QString QDomScriptRuleNode::body() const { return m_body; }
std::string QDomScriptRuleNode::bodyJs() const { return qToStd(body()); }
void QDomScriptRuleNode::setBody(const QString &body) { m_body = body; }
void QDomScriptRuleNode::setBodyJs(const std::string &body) { setBody(jsToQString(body)); }
void QDomScriptRuleNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("name"), m_name);
    if (!m_parameters.isEmpty()) {
        out.insert(QStringLiteral("parameters"), m_parameters);
    }
    if (!m_body.isEmpty()) {
        out.insert(QStringLiteral("body"), m_body);
    }
}

QDomColorNode::QDomColorNode(const QString &name, QObject *parent)
    : QDomNode(QStringLiteral("color"), parent), m_name(name)
{
}

QDomColorNode::QDomColorNode(const std::string &name)
    : QDomColorNode(jsToQString(name), nullptr)
{
}

QString QDomColorNode::name() const { return m_name; }
std::string QDomColorNode::nameJs() const { return qToStd(name()); }
void QDomColorNode::setName(const QString &name) { m_name = name; }
void QDomColorNode::setNameJs(const std::string &name) { setName(jsToQString(name)); }
QString QDomColorNode::value() const { return m_value; }
std::string QDomColorNode::valueJs() const { return qToStd(value()); }
void QDomColorNode::setValue(const QString &value) { m_value = value; }
void QDomColorNode::setValueJs(const std::string &value) { setValue(jsToQString(value)); }
void QDomColorNode::writePayload(QVariantMap &out) const
{
    out.insert(QStringLiteral("name"), m_name);
    if (!m_value.isEmpty()) {
        out.insert(QStringLiteral("value"), m_value);
    }
}

QDomDocumentNode *QDomBuilder::fromASTJson(const std::string &json)
{
    m_componentDefinitions.clear();
    m_templateDefinitions.clear();
    m_classDefinitions.clear();
    m_structDefinitions.clear();

    const QVariantMap ast = jsonToMap(jsToQString(json));
    auto *document = new QDomDocumentNode(ast.value(QStringLiteral("source")).toString());
    copyCommonMeta(document, ast);
    appendConvertedItems(document, ast.value(QStringLiteral("body")).toList());
    return document;
}

#ifdef __EMSCRIPTEN__
QDomDocumentNode *QDomBuilder::fromAST(emscripten::val ast)
{
    const std::string json = emscripten::val::global("JSON").call<std::string>("stringify", ast);
    return fromASTJson(json);
}
#endif

QDomNode *QDomBuilder::convertItem(const QVariantMap &item)
{
    const QString type = item.value(QStringLiteral("type")).toString();
    QDomNode *node = nullptr;

    if (type == QLatin1String("Element")) {
        node = convertElement(item);
    } else if (type == QLatin1String("TextBlock") || type == QLatin1String("RawTextLine")) {
        node = new QDomTextNode(item.value(QStringLiteral("text")).toString());
    } else if (type == QLatin1String("HtmlBlock")) {
        node = new QDomRawHtmlNode(item.value(QStringLiteral("html")).toString());
    } else if (type == QLatin1String("StyleBlock")) {
        node = new QDomRawHtmlNode(QStringLiteral("<style>") + item.value(QStringLiteral("css")).toString() + QStringLiteral("</style>"));
        node->setMetaValue(QStringLiteral("sourceType"), QStringLiteral("StyleBlock"));
    } else if (type == QLatin1String("ComponentDefinition") || type == QLatin1String("TemplateDefinition") ||
               type == QLatin1String("WorkerDefinition") || type == QLatin1String("MacroDefinition") ||
               type == QLatin1String("RewriteDefinition")) {
        auto *component = new QDomComponentNode(item.value(QStringLiteral("name")).toString());
        component->setDefinitionType(type);
        component->setDefinitionJson(variantToJson(commonDefinitionPayload(item)));
        node = component;
    } else if (type == QLatin1String("QClassDefinition")) {
        auto *klass = new QDomClassNode(item.value(QStringLiteral("classId")).toString());
        klass->setExtendsClassId(item.value(QStringLiteral("extendsClassId")).toString());
        klass->setConstructorJson(variantToJson(item.value(QStringLiteral("constructorDefinition"))));
        klass->setMethodsJson(variantToJson(item.value(QStringLiteral("methods"))));
        klass->setSlotDeclarationsJson(variantToJson(item.value(QStringLiteral("slots"))));
        node = klass;
    } else if (type == QLatin1String("QObjectDefinition")) {
        auto *structure = new QDomStructNode(item.value(QStringLiteral("name")).toString());
        structure->setFieldsJson(variantToJson(item.value(QStringLiteral("items"))));
        structure->setMetaValue(QStringLiteral("keyword"), item.value(QStringLiteral("keyword")).toString());
        node = structure;
    } else if (type == QLatin1String("QArrayDefinition")) {
        auto *model = new QDomModelNode(item.value(QStringLiteral("name")).toString());
        model->setMetaValue(QStringLiteral("body"), item.value(QStringLiteral("body")).toString());
        node = model;
    } else if (type == QLatin1String("QScriptInline") || type == QLatin1String("QScriptActionBlock")) {
        auto *script = new QDomScriptRuleNode(type);
        script->setBody(item.value(QStringLiteral("script")).toString());
        node = script;
    } else if (type == QLatin1String("FunctionBlock") || type == QLatin1String("CallbackDeclaration")) {
        auto *script = new QDomScriptRuleNode(item.value(QStringLiteral("name")).toString());
        script->setParameters(compactParameterSource(item.value(QStringLiteral("parameters"))));
        script->setBody(item.value(QStringLiteral("body")).toString());
        node = script;
    } else if (type == QLatin1String("EventBlock") || type == QLatin1String("SignalDefinition") ||
               type == QLatin1String("SignalDeclaration")) {
        auto *script = new QDomScriptRuleNode(item.value(QStringLiteral("name")).toString());
        if (script->name().isEmpty()) {
            script->setName(item.value(QStringLiteral("signalId")).toString());
        }
        script->setParameters(variantToJson(item.value(QStringLiteral("parameters"))));
        script->setBody(item.value(QStringLiteral("script")).toString());
        node = script;
    } else if (type == QLatin1String("QPropertyBlock") || type == QLatin1String("QWasmBlock") ||
               type == QLatin1String("ImportBlock") || type == QLatin1String("QVarDeclaration")) {
        node = new QDomNode(type.toLower());
    }

    if (!node) {
        node = new QDomNode(type.isEmpty() ? QStringLiteral("unknown") : type.toLower());
    }

    copyCommonMeta(node, item);
    registerDefinition(item, node);

    if (type != QLatin1String("Element") && type != QLatin1String("ComponentDefinition") &&
        type != QLatin1String("TemplateDefinition")) {
        appendConvertedItems(node, item.value(QStringLiteral("items")).toList());
    } else if (type == QLatin1String("ComponentDefinition") || type == QLatin1String("TemplateDefinition")) {
        appendConvertedItems(node, item.value(QStringLiteral("items")).toList());
    }

    return node;
}

QDomNode *QDomBuilder::convertElement(const QVariantMap &item)
{
    const QStringList selectors = variantStringList(item.value(QStringLiteral("selectors")));
    if (selectors.isEmpty()) {
        return nullptr;
    }

    QDomNode *root = nullptr;
    QDomNode *current = nullptr;
    for (const QString &selector : selectors) {
        QDomNode *node = createRenderableNode(selector, item);
        copyCommonMeta(node, item);
        if (auto *element = dynamic_cast<QDomElementNode *>(node)) {
            element->setSelectorChain(selectors);
            applySelectorAttributes(element, selector);
        }
        if (!root) {
            root = node;
        } else if (current) {
            current->addChild(node);
        }
        current = node;
    }

    const QVariantList items = item.value(QStringLiteral("items")).toList();
    for (const QVariant &entry : items) {
        const QVariantMap childItem = entry.toMap();
        if (childItem.value(QStringLiteral("type")).toString() == QLatin1String("Property")) {
            applyProperty(current, childItem);
            continue;
        }
        if (QDomNode *child = convertItem(childItem)) {
            current->addChild(child);
        }
    }
    return root;
}

QDomNode *QDomBuilder::createRenderableNode(const QString &selector, const QVariantMap &item)
{
    const QString tag = selectorTagName(selector);
    const QString alias = item.value(QStringLiteral("instanceAlias")).toString();

    if (tag == QLatin1String("slot")) {
        return new QDomSlotNode(slotNameFromElementItem(item));
    }
    if (m_classDefinitions.contains(tag)) {
        auto *instance = new QDomClassInstanceNode(tag);
        instance->setAlias(alias);
        instance->setArgumentSource(item.value(QStringLiteral("instanceArguments")).toString());
        instance->setArguments(variantStringList(item.value(QStringLiteral("argumentList"))));
        return instance;
    }
    if (m_templateDefinitions.contains(tag)) {
        auto *instance = new QDomTemplateInstanceNode(tag);
        instance->setAlias(alias);
        return instance;
    }
    if (m_componentDefinitions.contains(tag)) {
        auto *instance = new QDomComponentInstanceNode(tag);
        instance->setAlias(alias);
        return instance;
    }
    if (m_structDefinitions.contains(tag)) {
        auto *instance = new QDomStructInstanceNode(tag);
        instance->setAlias(alias);
        return instance;
    }

    return new QDomElementNode(tag);
}

void QDomBuilder::appendConvertedItems(QDomNode *parent, const QVariantList &items)
{
    if (!parent) {
        return;
    }
    for (const QVariant &entry : items) {
        const QVariantMap item = entry.toMap();
        if (item.value(QStringLiteral("type")).toString() == QLatin1String("Property")) {
            applyProperty(parent, item);
            continue;
        }
        if (QDomNode *child = convertItem(item)) {
            parent->addChild(child);
        }
    }
}

void QDomBuilder::applyProperty(QDomNode *node, const QVariantMap &item)
{
    if (!node) {
        return;
    }
    const QString name = item.value(QStringLiteral("name")).toString();
    const QVariant value = item.contains(QStringLiteral("value"))
        ? item.value(QStringLiteral("value"))
        : item.value(QStringLiteral("rawValue"));

    if (auto *element = dynamic_cast<QDomElementNode *>(node)) {
        element->setAttribute(name, value);
    } else if (auto *classInstance = dynamic_cast<QDomClassInstanceNode *>(node)) {
        classInstance->setAttribute(name, value);
        classInstance->setProp(name, value);
    } else if (auto *componentInstance = dynamic_cast<QDomComponentInstanceNode *>(node)) {
        componentInstance->setAttribute(name, value);
        componentInstance->setProp(name, value);
    } else if (auto *structInstance = dynamic_cast<QDomStructInstanceNode *>(node)) {
        structInstance->setProp(name, value);
    } else {
        node->setMetaValue(name, value);
    }
}

void QDomBuilder::copyCommonMeta(QDomNode *node, const QVariantMap &item)
{
    if (!node) {
        return;
    }
    const QStringList keys = {
        QStringLiteral("type"),
        QStringLiteral("start"),
        QStringLiteral("end"),
        QStringLiteral("raw"),
    };
    for (const QString &key : keys) {
        if (item.contains(key)) {
            node->setMetaValue(key, item.value(key));
        }
    }
}

void QDomBuilder::registerDefinition(const QVariantMap &item, QDomNode *)
{
    const QString type = item.value(QStringLiteral("type")).toString();
    if (type == QLatin1String("ComponentDefinition")) {
        m_componentDefinitions.insert(item.value(QStringLiteral("name")).toString());
    } else if (type == QLatin1String("TemplateDefinition")) {
        m_templateDefinitions.insert(item.value(QStringLiteral("name")).toString());
    } else if (type == QLatin1String("QClassDefinition")) {
        m_classDefinitions.insert(item.value(QStringLiteral("classId")).toString());
    } else if (type == QLatin1String("QObjectDefinition")) {
        const QString name = item.value(QStringLiteral("name")).toString();
        if (!name.isEmpty()) {
            m_structDefinitions.insert(name);
        }
    }
}

QDomDocument::~QDomDocument()
{
    delete m_root;
}

QDomDocument *QDomDocument::fromASTJson(const std::string &json)
{
    delete m_root;
    m_root = m_builder.fromASTJson(json);
    return this;
}

QDomDocumentNode *QDomDocument::root() const
{
    return m_root;
}

QDomElementNode *QDomDocument::createElement(const std::string &tagName) const
{
    return new QDomElementNode(tagName);
}

QDomTextNode *QDomDocument::createText(const std::string &text) const
{
    return new QDomTextNode(text);
}

QDomNode *QDomDocument::createInstance(const std::string &typeName, const std::string &name, const std::string &argsJson) const
{
    auto *node = new QDomComponentInstanceNode(typeName);
    node->setAliasJs(name);
    node->setMetaValue(QStringLiteral("arguments"), jsonToVariant(jsToQString(argsJson)));
    return node;
}

QDomNode *QDomDocument::findByUuid(const std::string &uuid) const
{
    return m_root ? m_root->findByUuidJs(uuid) : nullptr;
}

QDomNode *QDomDocument::findByName(const std::string &name) const
{
    return m_root ? m_root->findByNameJs(name) : nullptr;
}

QDomNode *QDomDocument::findByKind(const std::string &kind) const
{
    return m_root ? m_root->findByKindJs(kind) : nullptr;
}

QDomNode *QDomDocument::find(const std::string &query) const
{
    return m_root ? m_root->findJs(query) : nullptr;
}

#ifdef __EMSCRIPTEN__
QDomDocument *QDomDocument::fromAST(emscripten::val ast)
{
    const std::string json = emscripten::val::global("JSON").call<std::string>("stringify", ast);
    return fromASTJson(json);
}
#endif

#ifdef __EMSCRIPTEN__
using emscripten::allow_raw_pointers;
using emscripten::base;
using emscripten::class_;

EMSCRIPTEN_BINDINGS(qhtml_qdom_core) {
    class_<QDomNode>("QDomNode")
        .constructor<>()
        .constructor<std::string>()
        .function("kind", &QDomNode::kindJs)
        .function("objectName", &QDomNode::objectNameJs)
        .function("setObjectName", &QDomNode::setObjectNameJs)
        .function("parent", &QDomNode::parentNode, allow_raw_pointers())
        .function("setParent", &QDomNode::setParentNode, allow_raw_pointers())
        .function("uuid", &QDomNode::uuidJs)
        .function("setUuid", &QDomNode::setUuidJs)
        .function("domUuid", &QDomNode::domUuidJs)
        .function("setDomUuid", &QDomNode::setDomUuidJs)
        .function("addChild", &QDomNode::addChild, allow_raw_pointers())
        .function("insertChild", &QDomNode::insertChild, allow_raw_pointers())
        .function("removeChild", &QDomNode::removeChild, allow_raw_pointers())
        .function("childAt", &QDomNode::childAt, allow_raw_pointers())
        .function("childCount", &QDomNode::childCount)
        .function("children", &QDomNode::childrenJson)
        .function("parentNode", &QDomNode::parentNode, allow_raw_pointers())
        .function("findByUuid", &QDomNode::findByUuidJs, allow_raw_pointers())
        .function("findByKind", &QDomNode::findByKindJs, allow_raw_pointers())
        .function("findByName", &QDomNode::findByNameJs, allow_raw_pointers())
        .function("findByTagName", &QDomNode::findByTagNameJs, allow_raw_pointers())
        .function("find", &QDomNode::findJs, allow_raw_pointers())
        .function("setMetaValue", &QDomNode::setMetaValueJs)
        .function("metaValue", &QDomNode::metaValueJs)
        .function("metaJson", &QDomNode::metaJsonJs)
        .function("setMetaJson", &QDomNode::setMetaJsonJs)
        .function("setStringProperty", &QDomNode::setStringProperty)
        .function("setNumberProperty", &QDomNode::setNumberProperty)
        .function("setBoolProperty", &QDomNode::setBoolProperty)
        .function("stringProperty", &QDomNode::stringProperty)
        .function("numberProperty", &QDomNode::numberProperty)
        .function("boolProperty", &QDomNode::boolProperty)
        .function("hasProperty", &QDomNode::hasProperty)
        .function("setPropertyValue", &QDomNode::setPropertyValueJs)
        .function("propertyValue", &QDomNode::propertyValueJs)
        .function("propertyJson", &QDomNode::propertyJson)
        .function("propertyKeys", &QDomNode::propertyKeysJson)
        .function("connect", &QDomNode::connectJs)
        .function("disconnect", &QDomNode::disconnectJs)
        .function("emit", &QDomNode::emitJs)
        .function("toJson", &QDomNode::toJsonJs)
        .function("toObject", &QDomNode::toObjectJs);

    class_<QDomDocumentNode, base<QDomNode>>("QDomDocumentNode")
        .constructor<>()
        .constructor<std::string>()
        .function("source", &QDomDocumentNode::sourceJs)
        .function("setSource", &QDomDocumentNode::setSourceJs);

    class_<QDomElementNode, base<QDomNode>>("QDomElementNode")
        .constructor<>()
        .constructor<std::string>()
        .function("tagName", &QDomElementNode::tagNameJs)
        .function("setTagName", &QDomElementNode::setTagNameJs)
        .function("selectorChainJson", &QDomElementNode::selectorChainJsonJs)
        .function("setAttribute", &QDomElementNode::setAttributeJs)
        .function("attribute", &QDomElementNode::attributeJs)
        .function("hasAttribute", &QDomElementNode::hasAttributeJs)
        .function("attributesJson", &QDomElementNode::attributesJsonJs)
        .function("setTextContent", &QDomElementNode::setTextContentJs)
        .function("textContent", &QDomElementNode::textContentJs);

    class_<QDomTextNode, base<QDomNode>>("QDomTextNode")
        .constructor<>()
        .constructor<std::string>()
        .function("value", &QDomTextNode::valueJs)
        .function("setValue", &QDomTextNode::setValueJs);

    class_<QDomRawHtmlNode, base<QDomNode>>("QDomRawHtmlNode")
        .constructor<>()
        .constructor<std::string>()
        .function("html", &QDomRawHtmlNode::htmlJs)
        .function("setHtml", &QDomRawHtmlNode::setHtmlJs);

    class_<QDomModelNode, base<QDomNode>>("QDomModelNode")
        .constructor<>()
        .constructor<std::string>()
        .function("name", &QDomModelNode::nameJs)
        .function("setName", &QDomModelNode::setNameJs)
        .function("setEntriesJson", &QDomModelNode::setEntriesJsonJs)
        .function("entriesJson", &QDomModelNode::entriesJsonJs);

    class_<QDomRepeaterNode, base<QDomNode>>("QDomRepeaterNode")
        .constructor<>()
        .constructor<std::string>()
        .function("repeaterId", &QDomRepeaterNode::repeaterIdJs)
        .function("setRepeaterId", &QDomRepeaterNode::setRepeaterIdJs)
        .function("modelRef", &QDomRepeaterNode::modelRefJs)
        .function("setModelRef", &QDomRepeaterNode::setModelRefJs);

    class_<QDomComponentNode, base<QDomNode>>("QDomComponentNode")
        .constructor<>()
        .constructor<std::string>()
        .function("componentId", &QDomComponentNode::componentIdJs)
        .function("setComponentId", &QDomComponentNode::setComponentIdJs)
        .function("definitionType", &QDomComponentNode::definitionTypeJs)
        .function("setDefinitionType", &QDomComponentNode::setDefinitionTypeJs)
        .function("setDefinitionJson", &QDomComponentNode::setDefinitionJsonJs)
        .function("definitionJson", &QDomComponentNode::definitionJsonJs);

    class_<QDomComponentInstanceNode, base<QDomNode>>("QDomComponentInstanceNode")
        .constructor<>()
        .constructor<std::string>()
        .function("componentId", &QDomComponentInstanceNode::componentIdJs)
        .function("setComponentId", &QDomComponentInstanceNode::setComponentIdJs)
        .function("alias", &QDomComponentInstanceNode::aliasJs)
        .function("setAlias", &QDomComponentInstanceNode::setAliasJs)
        .function("setAttribute", &QDomComponentInstanceNode::setAttributeJs)
        .function("attribute", &QDomComponentInstanceNode::attributeJs)
        .function("attributesJson", &QDomComponentInstanceNode::attributesJsonJs)
        .function("setProp", &QDomComponentInstanceNode::setPropJs)
        .function("prop", &QDomComponentInstanceNode::propJs)
        .function("propsJson", &QDomComponentInstanceNode::propsJsonJs);

    class_<QDomTemplateInstanceNode, base<QDomComponentInstanceNode>>("QDomTemplateInstanceNode")
        .constructor<>()
        .constructor<std::string>();

    class_<QDomStructNode, base<QDomNode>>("QDomStructNode")
        .constructor<>()
        .constructor<std::string>()
        .function("structId", &QDomStructNode::structIdJs)
        .function("setStructId", &QDomStructNode::setStructIdJs)
        .function("setFieldsJson", &QDomStructNode::setFieldsJsonJs)
        .function("fieldsJson", &QDomStructNode::fieldsJsonJs);

    class_<QDomStructInstanceNode, base<QDomNode>>("QDomStructInstanceNode")
        .constructor<>()
        .constructor<std::string>()
        .function("structId", &QDomStructInstanceNode::structIdJs)
        .function("setStructId", &QDomStructInstanceNode::setStructIdJs)
        .function("alias", &QDomStructInstanceNode::aliasJs)
        .function("setAlias", &QDomStructInstanceNode::setAliasJs)
        .function("setProp", &QDomStructInstanceNode::setPropJs)
        .function("prop", &QDomStructInstanceNode::propJs)
        .function("propsJson", &QDomStructInstanceNode::propsJsonJs);

    class_<QDomClassNode, base<QDomNode>>("QDomClassNode")
        .constructor<>()
        .constructor<std::string>()
        .function("classId", &QDomClassNode::classIdJs)
        .function("setClassId", &QDomClassNode::setClassIdJs)
        .function("extendsClassId", &QDomClassNode::extendsClassIdJs)
        .function("setExtendsClassId", &QDomClassNode::setExtendsClassIdJs)
        .function("setConstructorJson", &QDomClassNode::setConstructorJsonJs)
        .function("constructorJson", &QDomClassNode::constructorJsonJs)
        .function("setMethodsJson", &QDomClassNode::setMethodsJsonJs)
        .function("methodsJson", &QDomClassNode::methodsJsonJs)
        .function("setSlotDeclarationsJson", &QDomClassNode::setSlotDeclarationsJsonJs)
        .function("slotDeclarationsJson", &QDomClassNode::slotDeclarationsJsonJs);

    class_<QDomClassInstanceNode, base<QDomNode>>("QDomClassInstanceNode")
        .constructor<>()
        .constructor<std::string>()
        .function("classId", &QDomClassInstanceNode::classIdJs)
        .function("setClassId", &QDomClassInstanceNode::setClassIdJs)
        .function("alias", &QDomClassInstanceNode::aliasJs)
        .function("setAlias", &QDomClassInstanceNode::setAliasJs)
        .function("argumentSource", &QDomClassInstanceNode::argumentSourceJs)
        .function("setArgumentSource", &QDomClassInstanceNode::setArgumentSourceJs)
        .function("argumentsJson", &QDomClassInstanceNode::argumentsJsonJs)
        .function("setAttribute", &QDomClassInstanceNode::setAttributeJs)
        .function("attribute", &QDomClassInstanceNode::attributeJs)
        .function("attributesJson", &QDomClassInstanceNode::attributesJsonJs)
        .function("setProp", &QDomClassInstanceNode::setPropJs)
        .function("prop", &QDomClassInstanceNode::propJs)
        .function("propsJson", &QDomClassInstanceNode::propsJsonJs);

    class_<QDomSlotNode, base<QDomNode>>("QDomSlotNode")
        .constructor<>()
        .constructor<std::string>()
        .function("name", &QDomSlotNode::nameJs)
        .function("setName", &QDomSlotNode::setNameJs);

    class_<QDomSlotDefaultNode, base<QDomSlotNode>>("QDomSlotDefaultNode")
        .constructor<>()
        .constructor<std::string>();

    class_<QDomScriptRuleNode, base<QDomNode>>("QDomScriptRuleNode")
        .constructor<>()
        .constructor<std::string>()
        .function("name", &QDomScriptRuleNode::nameJs)
        .function("setName", &QDomScriptRuleNode::setNameJs)
        .function("parameters", &QDomScriptRuleNode::parametersJs)
        .function("setParameters", &QDomScriptRuleNode::setParametersJs)
        .function("body", &QDomScriptRuleNode::bodyJs)
        .function("setBody", &QDomScriptRuleNode::setBodyJs);

    class_<QDomColorNode, base<QDomNode>>("QDomColorNode")
        .constructor<>()
        .constructor<std::string>()
        .function("name", &QDomColorNode::nameJs)
        .function("setName", &QDomColorNode::setNameJs)
        .function("value", &QDomColorNode::valueJs)
        .function("setValue", &QDomColorNode::setValueJs);

    class_<QDomBuilder>("QDomBuilder")
        .constructor<>()
        .function("fromASTJson", &QDomBuilder::fromASTJson, allow_raw_pointers())
        .function("fromAST", &QDomBuilder::fromAST, allow_raw_pointers());

    class_<QDomDocument>("QDomDocument")
        .constructor<>()
        .function("fromASTJson", &QDomDocument::fromASTJson, allow_raw_pointers())
        .function("fromAST", &QDomDocument::fromAST, allow_raw_pointers())
        .function("root", &QDomDocument::root, allow_raw_pointers())
        .function("createElement", &QDomDocument::createElement, allow_raw_pointers())
        .function("createText", &QDomDocument::createText, allow_raw_pointers())
        .function("createInstance", &QDomDocument::createInstance, allow_raw_pointers())
        .function("findByUuid", &QDomDocument::findByUuid, allow_raw_pointers())
        .function("findByName", &QDomDocument::findByName, allow_raw_pointers())
        .function("findByKind", &QDomDocument::findByKind, allow_raw_pointers())
        .function("find", &QDomDocument::find, allow_raw_pointers());
}
#endif
