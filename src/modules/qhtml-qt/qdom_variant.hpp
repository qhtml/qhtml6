#pragma once

#include "qdom_components.hpp"

#include <QtCore/QHash>
#include <QtCore/QMetaType>
#include <QtCore/QSharedPointer>
#include <QtCore/QString>
#include <QtCore/QVariant>
#include <QtCore/QVariantList>
#include <QtCore/QVariantMap>
#include <QtCore/QVector>

#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>
#include <emscripten/val.h>
#endif

Q_DECLARE_METATYPE(qhtml::wasm::QDomNodePtr)
Q_DECLARE_METATYPE(QSharedPointer<qhtml::wasm::QDomDocument>)

namespace qhtml::wasm {

class QDomVariantBridge;

inline QString qdomNodeKindName(QDomNodeKind kind)
{
    switch (kind) {
    case QDomNodeKind::Document: return QStringLiteral("document");
    case QDomNodeKind::Component: return QStringLiteral("component");
    case QDomNodeKind::ComponentInstance: return QStringLiteral("component-instance");
    case QDomNodeKind::Element: return QStringLiteral("element");
    case QDomNodeKind::Slot: return QStringLiteral("slot");
    case QDomNodeKind::Text: return QStringLiteral("text");
    case QDomNodeKind::RawHtml: return QStringLiteral("raw-html");
    case QDomNodeKind::Model: return QStringLiteral("model");
    case QDomNodeKind::Repeater: return QStringLiteral("repeater");
    case QDomNodeKind::TemplateInstance: return QStringLiteral("template-instance");
    case QDomNodeKind::StructDefinition: return QStringLiteral("struct-definition");
    case QDomNodeKind::StructInstance: return QStringLiteral("struct-instance");
    case QDomNodeKind::ClassDefinition: return QStringLiteral("class-definition");
    case QDomNodeKind::ClassInstance: return QStringLiteral("class-instance");
    case QDomNodeKind::ScriptRule: return QStringLiteral("script-rule");
    case QDomNodeKind::Color: return QStringLiteral("color");
    }
    return QStringLiteral("node");
}

inline QDomNodePtr makeNodeForKind(const QString &kindName)
{
    const QString kind = kindName.trimmed().toLower();
    if (kind == QStringLiteral("text")) return QSharedPointer<QDomTextNode>::create();
    if (kind == QStringLiteral("raw-html") || kind == QStringLiteral("html")) return QSharedPointer<QDomRawHtmlNode>::create();
    if (kind == QStringLiteral("slot")) return QSharedPointer<QDomSlotNode>::create();
    if (kind == QStringLiteral("component")) return QSharedPointer<QDomComponentDefinitionNode>::create();
    if (kind == QStringLiteral("component-instance")) return QSharedPointer<QDomComponentInstanceNode>::create();
    if (kind == QStringLiteral("template-instance")) return QSharedPointer<QDomTemplateInstanceNode>::create();
    if (kind == QStringLiteral("struct-definition")) return QSharedPointer<QDomStructDefinitionNode>::create();
    if (kind == QStringLiteral("struct-instance")) return QSharedPointer<QDomStructInstanceNode>::create();
    if (kind == QStringLiteral("class-definition")) return QSharedPointer<QDomClassDefinitionNode>::create();
    if (kind == QStringLiteral("class-instance")) return QSharedPointer<QDomClassInstanceNode>::create();
    if (kind == QStringLiteral("script-rule")) return QSharedPointer<QDomScriptRuleNode>::create();
    if (kind == QStringLiteral("model")) return QSharedPointer<QDomModelNode>::create();
    if (kind == QStringLiteral("repeater")) return QSharedPointer<QDomRepeaterNode>::create();
    if (kind == QStringLiteral("color")) return QSharedPointer<QDomColorNode>::create();
    return QSharedPointer<QDomElementNode>::create();
}

class QDomNodeHandle {
public:
    QDomNodeHandle() : node_(makeNodeForKind(QStringLiteral("element"))) {}
    explicit QDomNodeHandle(const std::string &kindName)
        : node_(makeNodeForKind(qStringFromStdString(kindName))) {}
    explicit QDomNodeHandle(QDomNodePtr node) : node_(std::move(node)) {}

    [[nodiscard]] bool isValid() const { return !node_.isNull(); }
    [[nodiscard]] std::string kind() const { return node_ ? stdStringFromQString(qdomNodeKindName(node_->kind)) : std::string(); }
    [[nodiscard]] std::string uuid() const { return node_ ? stdStringFromQString(node_->meta.uuid) : std::string(); }
    void setUuid(const std::string &uuid) { if (node_) node_->meta.uuid = qStringFromStdString(uuid); }

    [[nodiscard]] std::string propertyString(const std::string &name) const
    {
        return node_ ? stdStringFromQString(node_->properties.value(qStringFromStdString(name)).toString()) : std::string();
    }

    [[nodiscard]] double propertyNumber(const std::string &name) const
    {
        return node_ ? node_->properties.value(qStringFromStdString(name)).toDouble() : 0.0;
    }

    void setPropertyString(const std::string &name, const std::string &value)
    {
        if (node_) node_->properties.insert(qStringFromStdString(name), qStringFromStdString(value));
    }

    void setPropertyNumber(const std::string &name, double value)
    {
        if (node_) node_->properties.insert(qStringFromStdString(name), value);
    }

    [[nodiscard]] QDomNodePtr node() const { return node_; }

private:
    QDomNodePtr node_;
};

class QDomDocumentHandle {
public:
    QDomDocumentHandle() : document_(QSharedPointer<QDomDocument>::create()) {}
    explicit QDomDocumentHandle(QSharedPointer<QDomDocument> document) : document_(std::move(document)) {}

    [[nodiscard]] bool isValid() const { return !document_.isNull(); }
    [[nodiscard]] std::string uuid() const { return document_ ? stdStringFromQString(document_->meta.uuid) : std::string(); }
    void setUuid(const std::string &uuid) { if (document_) document_->meta.uuid = qStringFromStdString(uuid); }

    void appendNode(QDomNodeHandle *node)
    {
        if (document_ && node && node->isValid()) {
            document_->nodes.append(node->node());
        }
    }

    [[nodiscard]] int nodeCount() const { return document_ ? document_->nodes.size() : 0; }

    [[nodiscard]] QDomNodeHandle nodeAt(int index) const
    {
        if (!document_ || index < 0 || index >= document_->nodes.size()) {
            return QDomNodeHandle(QDomNodePtr());
        }
        return QDomNodeHandle(document_->nodes.at(index));
    }

    [[nodiscard]] QSharedPointer<QDomDocument> document() const { return document_; }

private:
    QSharedPointer<QDomDocument> document_;
};

class QDomVariantBridge {
public:
    enum class Kind {
        Invalid,
        Bool,
        Number,
        String,
        List,
        Map,
        QDomNode,
        QDomDocument
    };

    QDomVariantBridge() = default;
    explicit QDomVariantBridge(bool value) { setBool(value); }
    explicit QDomVariantBridge(double value) { setNumber(value); }
    explicit QDomVariantBridge(const std::string &value) { setString(value); }
    explicit QDomVariantBridge(QVariant value) { assignVariant(std::move(value)); }

    static QDomVariantBridge fromVariant(const QVariant &value) { return QDomVariantBridge(value); }

    [[nodiscard]] QVariant toVariant() const
    {
        switch (kind_) {
        case Kind::Invalid:
            return {};
        case Kind::List: {
            QVariantList list;
            for (const QDomVariantBridge &item : list_) {
                list.append(item.toVariant());
            }
            return list;
        }
        case Kind::Map: {
            QVariantMap map;
            for (auto it = map_.cbegin(); it != map_.cend(); ++it) {
                map.insert(it.key(), it.value().toVariant());
            }
            return map;
        }
        case Kind::QDomNode:
            return QVariant::fromValue(node_);
        case Kind::QDomDocument:
            return QVariant::fromValue(document_);
        default:
            return value_;
        }
    }

    [[nodiscard]] std::string typeName() const
    {
        switch (kind_) {
        case Kind::Invalid: return "invalid";
        case Kind::Bool: return "bool";
        case Kind::Number: return "number";
        case Kind::String: return "string";
        case Kind::List: return "list";
        case Kind::Map: return "map";
        case Kind::QDomNode: return "qdom-node";
        case Kind::QDomDocument: return "qdom-document";
        }
        return "invalid";
    }

    [[nodiscard]] bool isValid() const { return kind_ != Kind::Invalid; }
    [[nodiscard]] bool isBool() const { return kind_ == Kind::Bool; }
    [[nodiscard]] bool isNumber() const { return kind_ == Kind::Number; }
    [[nodiscard]] bool isString() const { return kind_ == Kind::String; }
    [[nodiscard]] bool isList() const { return kind_ == Kind::List; }
    [[nodiscard]] bool isMap() const { return kind_ == Kind::Map; }
    [[nodiscard]] bool isQDomNode() const { return kind_ == Kind::QDomNode && !node_.isNull(); }
    [[nodiscard]] bool isQDomDocument() const { return kind_ == Kind::QDomDocument && !document_.isNull(); }

    void clear()
    {
        kind_ = Kind::Invalid;
        value_ = {};
        list_.clear();
        map_.clear();
        node_.clear();
        document_.clear();
    }

    void setBool(bool value)
    {
        clear();
        kind_ = Kind::Bool;
        value_ = value;
    }

    void setNumber(double value)
    {
        clear();
        kind_ = Kind::Number;
        value_ = value;
    }

    void setString(const std::string &value)
    {
        clear();
        kind_ = Kind::String;
        value_ = qStringFromStdString(value);
    }

    void setList()
    {
        clear();
        kind_ = Kind::List;
    }

    void append(QDomVariantBridge *value)
    {
        if (kind_ != Kind::List) {
            setList();
        }
        list_.append(value ? *value : QDomVariantBridge());
    }

    [[nodiscard]] int length() const { return list_.size(); }

    [[nodiscard]] QDomVariantBridge at(int index) const
    {
        if (index < 0 || index >= list_.size()) {
            return {};
        }
        return list_.at(index);
    }

    void setMap()
    {
        clear();
        kind_ = Kind::Map;
    }

    void setMapValue(const std::string &key, QDomVariantBridge *value)
    {
        if (kind_ != Kind::Map) {
            setMap();
        }
        map_.insert(qStringFromStdString(key), value ? *value : QDomVariantBridge());
    }

    [[nodiscard]] QDomVariantBridge mapValue(const std::string &key) const
    {
        return map_.value(qStringFromStdString(key));
    }

    void setNode(QDomNodeHandle *node)
    {
        clear();
        kind_ = Kind::QDomNode;
        node_ = node ? node->node() : QDomNodePtr();
    }

    void setDocument(QDomDocumentHandle *document)
    {
        clear();
        kind_ = Kind::QDomDocument;
        document_ = document ? document->document() : QSharedPointer<QDomDocument>();
    }

    [[nodiscard]] bool toBool() const { return value_.toBool(); }
    [[nodiscard]] double toNumber() const { return value_.toDouble(); }
    [[nodiscard]] std::string toString() const { return stdStringFromQString(value_.toString()); }
    [[nodiscard]] QDomNodeHandle toQDomNode() const { return QDomNodeHandle(node_); }
    [[nodiscard]] QDomDocumentHandle toQDomDocument() const { return QDomDocumentHandle(document_); }
    [[nodiscard]] std::string qdomNodeKind() const { return isQDomNode() ? stdStringFromQString(qdomNodeKindName(node_->kind)) : std::string(); }
    [[nodiscard]] std::string qdomNodeUuid() const { return isQDomNode() ? stdStringFromQString(node_->meta.uuid) : std::string(); }
    [[nodiscard]] std::string qdomDocumentUuid() const { return isQDomDocument() ? stdStringFromQString(document_->meta.uuid) : std::string(); }

#ifdef __EMSCRIPTEN__
    [[nodiscard]] emscripten::val toJsValue() const
    {
        using emscripten::val;
        switch (kind_) {
        case Kind::Invalid:
            return val::undefined();
        case Kind::Bool:
            return val(value_.toBool());
        case Kind::Number:
            return val(value_.toDouble());
        case Kind::String:
            return val(stdStringFromQString(value_.toString()));
        case Kind::List: {
            val out = val::array();
            for (int i = 0; i < list_.size(); ++i) {
                out.set(i, list_.at(i).toJsValue());
            }
            return out;
        }
        case Kind::Map: {
            val out = val::object();
            for (auto it = map_.cbegin(); it != map_.cend(); ++it) {
                out.set(stdStringFromQString(it.key()), it.value().toJsValue());
            }
            return out;
        }
        case Kind::QDomNode: {
            val out = val::object();
            out.set("__qhtmlQDomHandle", true);
            out.set("type", "node");
            out.set("kind", qdomNodeKind());
            out.set("uuid", qdomNodeUuid());
            return out;
        }
        case Kind::QDomDocument: {
            val out = val::object();
            out.set("__qhtmlQDomHandle", true);
            out.set("type", "document");
            out.set("uuid", qdomDocumentUuid());
            return out;
        }
        }
        return val::undefined();
    }
#endif

private:
    void assignVariant(QVariant value)
    {
        clear();
        kind_ = kindFromVariant(value);
        switch (kind_) {
        case Kind::List:
            for (const QVariant &item : value.toList()) {
                list_.append(QDomVariantBridge::fromVariant(item));
            }
            break;
        case Kind::Map: {
            const QVariantMap source = value.toMap();
            for (auto it = source.cbegin(); it != source.cend(); ++it) {
                map_.insert(it.key(), QDomVariantBridge::fromVariant(it.value()));
            }
            break;
        }
        case Kind::QDomNode:
            node_ = value.value<QDomNodePtr>();
            break;
        case Kind::QDomDocument:
            document_ = value.value<QSharedPointer<QDomDocument>>();
            break;
        case Kind::Invalid:
            break;
        default:
            value_ = std::move(value);
            break;
        }
    }

    static Kind kindFromVariant(const QVariant &value)
    {
        if (!value.isValid() || value.isNull()) {
            return Kind::Invalid;
        }
        if (value.metaType() == QMetaType::fromType<QDomNodePtr>()) {
            return Kind::QDomNode;
        }
        if (value.metaType() == QMetaType::fromType<QSharedPointer<QDomDocument>>()) {
            return Kind::QDomDocument;
        }
        switch (value.metaType().id()) {
        case QMetaType::Bool:
            return Kind::Bool;
        case QMetaType::Int:
        case QMetaType::LongLong:
        case QMetaType::UInt:
        case QMetaType::ULongLong:
        case QMetaType::Float:
        case QMetaType::Double:
            return Kind::Number;
        case QMetaType::QString:
            return Kind::String;
        case QMetaType::QVariantList:
            return Kind::List;
        case QMetaType::QVariantMap:
            return Kind::Map;
        default:
            return Kind::String;
        }
    }

    Kind kind_ = Kind::Invalid;
    QVariant value_;
    QVector<QDomVariantBridge> list_;
    QHash<QString, QDomVariantBridge> map_;
    QDomNodePtr node_;
    QSharedPointer<QDomDocument> document_;
};

} // namespace qhtml::wasm

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_BINDINGS(qhtml_qdom_variant)
{
    emscripten::class_<qhtml::wasm::QDomNodeHandle>("QDomNode")
        .constructor<>()
        .constructor<std::string>()
        .function("isValid", &qhtml::wasm::QDomNodeHandle::isValid)
        .function("kind", &qhtml::wasm::QDomNodeHandle::kind)
        .function("uuid", &qhtml::wasm::QDomNodeHandle::uuid)
        .function("setUuid", &qhtml::wasm::QDomNodeHandle::setUuid)
        .function("propertyString", &qhtml::wasm::QDomNodeHandle::propertyString)
        .function("propertyNumber", &qhtml::wasm::QDomNodeHandle::propertyNumber)
        .function("setPropertyString", &qhtml::wasm::QDomNodeHandle::setPropertyString)
        .function("setPropertyNumber", &qhtml::wasm::QDomNodeHandle::setPropertyNumber);

    emscripten::class_<qhtml::wasm::QDomDocumentHandle>("QDomDocument")
        .constructor<>()
        .function("isValid", &qhtml::wasm::QDomDocumentHandle::isValid)
        .function("uuid", &qhtml::wasm::QDomDocumentHandle::uuid)
        .function("setUuid", &qhtml::wasm::QDomDocumentHandle::setUuid)
        .function("appendNode", &qhtml::wasm::QDomDocumentHandle::appendNode, emscripten::allow_raw_pointers())
        .function("nodeCount", &qhtml::wasm::QDomDocumentHandle::nodeCount)
        .function("nodeAt", &qhtml::wasm::QDomDocumentHandle::nodeAt);

    emscripten::class_<qhtml::wasm::QDomVariantBridge>("QVariant")
        .constructor<>()
        .function("typeName", &qhtml::wasm::QDomVariantBridge::typeName)
        .function("isValid", &qhtml::wasm::QDomVariantBridge::isValid)
        .function("isBool", &qhtml::wasm::QDomVariantBridge::isBool)
        .function("isNumber", &qhtml::wasm::QDomVariantBridge::isNumber)
        .function("isString", &qhtml::wasm::QDomVariantBridge::isString)
        .function("isList", &qhtml::wasm::QDomVariantBridge::isList)
        .function("isMap", &qhtml::wasm::QDomVariantBridge::isMap)
        .function("isQDomNode", &qhtml::wasm::QDomVariantBridge::isQDomNode)
        .function("isQDomDocument", &qhtml::wasm::QDomVariantBridge::isQDomDocument)
        .function("clear", &qhtml::wasm::QDomVariantBridge::clear)
        .function("setBool", &qhtml::wasm::QDomVariantBridge::setBool)
        .function("setNumber", &qhtml::wasm::QDomVariantBridge::setNumber)
        .function("setString", &qhtml::wasm::QDomVariantBridge::setString)
        .function("setList", &qhtml::wasm::QDomVariantBridge::setList)
        .function("append", &qhtml::wasm::QDomVariantBridge::append, emscripten::allow_raw_pointers())
        .function("length", &qhtml::wasm::QDomVariantBridge::length)
        .function("at", &qhtml::wasm::QDomVariantBridge::at)
        .function("setMap", &qhtml::wasm::QDomVariantBridge::setMap)
        .function("setMapValue", &qhtml::wasm::QDomVariantBridge::setMapValue, emscripten::allow_raw_pointers())
        .function("mapValue", &qhtml::wasm::QDomVariantBridge::mapValue)
        .function("setNode", &qhtml::wasm::QDomVariantBridge::setNode, emscripten::allow_raw_pointers())
        .function("setDocument", &qhtml::wasm::QDomVariantBridge::setDocument, emscripten::allow_raw_pointers())
        .function("toBool", &qhtml::wasm::QDomVariantBridge::toBool)
        .function("toNumber", &qhtml::wasm::QDomVariantBridge::toNumber)
        .function("toString", &qhtml::wasm::QDomVariantBridge::toString)
        .function("toQDomNode", &qhtml::wasm::QDomVariantBridge::toQDomNode)
        .function("toQDomDocument", &qhtml::wasm::QDomVariantBridge::toQDomDocument)
        .function("qdomNodeKind", &qhtml::wasm::QDomVariantBridge::qdomNodeKind)
        .function("qdomNodeUuid", &qhtml::wasm::QDomVariantBridge::qdomNodeUuid)
        .function("qdomDocumentUuid", &qhtml::wasm::QDomVariantBridge::qdomDocumentUuid)
        .function("toJsValue", &qhtml::wasm::QDomVariantBridge::toJsValue);
}
#endif
