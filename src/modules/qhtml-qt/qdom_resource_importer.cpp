#include "qdom_resource_importer.hpp"

#ifdef __EMSCRIPTEN__
#include <QtCore/QMetaType>

#include <emscripten/bind.h>
#include <emscripten/val.h>

namespace {

using emscripten::val;

val qstringToVal(const QString &value)
{
    return val(qhtml::wasm::stdStringFromQString(value));
}

val stringListToVal(const QStringList &values)
{
    val out = val::array();
    int index = 0;
    for (const QString &value : values) {
        out.set(index++, qstringToVal(value));
    }
    return out;
}

val variantToVal(const QVariant &value);

val variantListToVal(const QVariantList &values)
{
    val out = val::array();
    for (int index = 0; index < values.size(); ++index) {
        out.set(index, variantToVal(values.at(index)));
    }
    return out;
}

val variantMapToVal(const QVariantMap &values)
{
    val out = val::object();
    for (auto it = values.cbegin(); it != values.cend(); ++it) {
        out.set(qhtml::wasm::stdStringFromQString(it.key()), variantToVal(it.value()));
    }
    return out;
}

val variantHashToVal(const QHash<QString, QVariant> &values)
{
    val out = val::object();
    for (auto it = values.cbegin(); it != values.cend(); ++it) {
        out.set(qhtml::wasm::stdStringFromQString(it.key()), variantToVal(it.value()));
    }
    return out;
}

val variantToVal(const QVariant &value)
{
    if (!value.isValid() || value.isNull()) {
        return val::undefined();
    }
    switch (value.metaType().id()) {
    case QMetaType::Bool:
        return val(value.toBool());
    case QMetaType::Int:
    case QMetaType::LongLong:
    case QMetaType::UInt:
    case QMetaType::ULongLong:
    case QMetaType::Float:
    case QMetaType::Double:
        return val(value.toDouble());
    case QMetaType::QString:
        return qstringToVal(value.toString());
    case QMetaType::QStringList:
        return stringListToVal(value.toStringList());
    case QMetaType::QVariantList:
        return variantListToVal(value.toList());
    case QMetaType::QVariantMap:
        return variantMapToVal(value.toMap());
    default:
        if (value.canConvert<QVariantList>()) {
            return variantListToVal(value.toList());
        }
        if (value.canConvert<QVariantMap>()) {
            return variantMapToVal(value.toMap());
        }
        return qstringToVal(value.toString());
    }
}

val attributesToVal(const qhtml::wasm::QDomAttributes &attributes)
{
    val out = val::object();
    for (auto it = attributes.cbegin(); it != attributes.cend(); ++it) {
        out.set(qhtml::wasm::stdStringFromQString(it.key()), qstringToVal(it.value()));
    }
    return out;
}

val propertiesToVal(const qhtml::wasm::QDomProperties &properties)
{
    val out = val::object();
    for (auto it = properties.cbegin(); it != properties.cend(); ++it) {
        out.set(qhtml::wasm::stdStringFromQString(it.key()), variantToVal(it.value()));
    }
    return out;
}

val nodeListToVal(const QVector<qhtml::wasm::QDomNodePtr> &nodes);

val lifecycleScriptsToVal(const QVector<qhtml::wasm::QDomLifecycleScript> &scripts)
{
    val out = val::array();
    for (int index = 0; index < scripts.size(); ++index) {
        const auto &script = scripts.at(index);
        val item = val::object();
        item.set("name", qstringToVal(script.name));
        item.set("body", qstringToVal(script.body));
        item.set("isQConnect", val(script.isQConnect));
        item.set("isLifecycle", val(script.name.toLower() == QLatin1String("onready") ||
            script.name.toLower() == QLatin1String("onload") ||
            script.name.toLower() == QLatin1String("onloaded")));
        out.set(index, item);
    }
    return out;
}

val methodsToVal(const QVector<qhtml::wasm::QDomMethodDefinition> &methods)
{
    val out = val::object();
    for (const auto &method : methods) {
        val item = val::object();
        item.set("name", qstringToVal(method.name));
        item.set("parameters", qstringToVal(method.parameters));
        item.set("body", qstringToVal(method.body));
        item.set("signature", qstringToVal(method.signature));
        out.set(qhtml::wasm::stdStringFromQString(method.name), item);
    }
    return out;
}

val signalsToVal(const QVector<qhtml::wasm::QDomSignalDeclaration> &signalDeclarations)
{
    val out = val::array();
    for (int index = 0; index < signalDeclarations.size(); ++index) {
        const auto &signal = signalDeclarations.at(index);
        val item = val::object();
        item.set("name", qstringToVal(signal.name));
        item.set("parameters", stringListToVal(signal.parameters));
        item.set("signature", qstringToVal(signal.signature));
        out.set(index, item);
    }
    return out;
}

val propertyNamesToVal(const QVector<qhtml::wasm::QDomPropertyDefinition> &properties)
{
    val out = val::array();
    for (int index = 0; index < properties.size(); ++index) {
        out.set(index, qstringToVal(properties.at(index).name));
    }
    return out;
}

val propertyDefaultsToVal(const QVector<qhtml::wasm::QDomPropertyDefinition> &properties)
{
    val out = val::object();
    for (const auto &property : properties) {
        out.set(qhtml::wasm::stdStringFromQString(property.name), variantToVal(property.defaultValue));
    }
    return out;
}

val slotMapToVal(const QVector<qhtml::wasm::QDomSlotNodePtr> &slotNodes)
{
    val map = val::global("Map").new_();
    for (const auto &slot : slotNodes) {
        if (slot) {
            map.call<void>("set", qhtml::wasm::stdStringFromQString(slot->name), nodeListToVal(slot->children));
        }
    }
    return map;
}

val nodeKindToVal(qhtml::wasm::QDomNodeKind kind)
{
    using qhtml::wasm::QDomNodeKind;
    switch (kind) {
    case QDomNodeKind::Document:
        return val("document");
    case QDomNodeKind::Component:
        return val("component");
    case QDomNodeKind::ComponentInstance:
        return val("component-instance");
    case QDomNodeKind::Element:
        return val("element");
    case QDomNodeKind::Slot:
        return val("slot");
    case QDomNodeKind::Text:
        return val("text");
    case QDomNodeKind::RawHtml:
        return val("raw-html");
    case QDomNodeKind::Model:
        return val("model");
    case QDomNodeKind::Repeater:
        return val("repeater");
    case QDomNodeKind::TemplateInstance:
        return val("template-instance");
    case QDomNodeKind::StructDefinition:
        return val("struct-definition");
    case QDomNodeKind::StructInstance:
        return val("struct-instance");
    case QDomNodeKind::ClassDefinition:
        return val("class-definition");
    case QDomNodeKind::ClassInstance:
        return val("class-instance");
    case QDomNodeKind::ScriptRule:
        return val("script-rule");
    case QDomNodeKind::Color:
        return val("color");
    }
    return val("node");
}

val nodeToVal(const qhtml::wasm::QDomNodePtr &node)
{
    if (!node) {
        return val::undefined();
    }

    val out = val::object();
    out.set("kind", nodeKindToVal(node->kind));
    out.set("attributes", attributesToVal(node->attributes));
    out.set("properties", propertiesToVal(node->properties));
    out.set("styleRefs", stringListToVal(node->styleRefs));

    val meta = val::object();
    meta.set("uuid", qstringToVal(node->meta.uuid));
    meta.set("source", qstringToVal(node->meta.source));
    meta.set("instanceAlias", qstringToVal(node->meta.instanceAlias));
    out.set("meta", meta);

    if (const auto *text = dynamic_cast<const qhtml::wasm::QDomTextNode *>(node.data())) {
        out.set("value", qstringToVal(text->value));
    } else if (const auto *html = dynamic_cast<const qhtml::wasm::QDomRawHtmlNode *>(node.data())) {
        out.set("html", qstringToVal(html->html));
    } else if (const auto *element = dynamic_cast<const qhtml::wasm::QDomElementNode *>(node.data())) {
        out.set("tagName", qstringToVal(element->tagName));
        out.set("children", nodeListToVal(element->children));
    } else if (const auto *slot = dynamic_cast<const qhtml::wasm::QDomSlotNode *>(node.data())) {
        out.set("name", qstringToVal(slot->name));
        out.set("children", nodeListToVal(slot->children));
    } else if (const auto *component = dynamic_cast<const qhtml::wasm::QDomComponentDefinitionNode *>(node.data())) {
        out.set("componentId", qstringToVal(component->componentId));
        out.set("definitionType", qstringToVal(component->definitionType));
        out.set("extends", stringListToVal(component->extendsComponentIds));
        out.set("properties", propertyNamesToVal(component->propertyDefinitions));
        out.set("propertyDefaults", propertyDefaultsToVal(component->propertyDefinitions));
        out.set("signals", signalsToVal(component->signalDeclarations));
        out.set("methods", methodsToVal(component->methods));
        out.set("lifecycleScripts", lifecycleScriptsToVal(component->lifecycleScripts));
        out.set("templateNodes", nodeListToVal(component->templateNodes));
    } else if (const auto *instance = dynamic_cast<const qhtml::wasm::QDomComponentInstanceNode *>(node.data())) {
        out.set("componentId", qstringToVal(instance->componentId));
        out.set("tagName", qstringToVal(instance->tagName));
        out.set("alias", qstringToVal(instance->meta.instanceAlias));
        out.set("props", propertiesToVal(instance->props));
        out.set("slotNodes", slotMapToVal(instance->slotNodes));
        out.set("children", nodeListToVal(instance->children));
    } else if (const auto *script = dynamic_cast<const qhtml::wasm::QDomScriptRuleNode *>(node.data())) {
        out.set("name", qstringToVal(script->name));
        out.set("parameters", qstringToVal(script->parameters));
        out.set("body", qstringToVal(script->body));
        out.set("isLifecycle", val(script->isLifecycle));
        out.set("isQConnect", val(script->isConnection));
    } else if (const auto *model = dynamic_cast<const qhtml::wasm::QDomModelNode *>(node.data())) {
        out.set("name", qstringToVal(model->name));
        out.set("source", variantToVal(model->source));
        out.set("entries", variantListToVal(model->entries));
        out.set("alias", qstringToVal(model->alias));
    } else if (const auto *repeater = dynamic_cast<const qhtml::wasm::QDomRepeaterNode *>(node.data())) {
        out.set("repeaterId", qstringToVal(repeater->repeaterId));
        out.set("modelRef", qstringToVal(repeater->modelRef));
        out.set("alias", qstringToVal(repeater->alias));
        out.set("templateNodes", nodeListToVal(repeater->templateNodes));
    }

    return out;
}

val nodeListToVal(const QVector<qhtml::wasm::QDomNodePtr> &nodes)
{
    val out = val::array();
    for (int index = 0; index < nodes.size(); ++index) {
        out.set(index, nodeToVal(nodes.at(index)));
    }
    return out;
}

val documentToVal(const qhtml::wasm::QDomDocument &document)
{
    val out = val::object();
    out.set("kind", val("document"));
    out.set("nodes", nodeListToVal(document.nodes));
    val meta = val::object();
    meta.set("uuid", qstringToVal(document.meta.uuid));
    meta.set("source", qstringToVal(document.meta.source));
    out.set("meta", meta);
    return out;
}

std::string qhtmlResourceNormalizePath(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().normalizePathJs(path);
}

bool qhtmlResourceExists(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().existsJs(path);
}

std::string qhtmlReadResource(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().readTextJs(path);
}

std::string qhtmlExpandResource(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().expandedSourceJs(path);
}

std::string qhtmlExpandResourceImportsInSource(const std::string &source)
{
    return qhtml::wasm::QDomResourceImporter().expandImportsInSourceJs(source);
}

int qhtmlParsedResourceNodeCount(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().parsedResourceNodeCountJs(path);
}

std::string qhtmlResourcePaths()
{
    return qhtml::wasm::QDomResourceImporter().resourcePathsJs();
}

val qhtmlParseSourceToObject(const std::string &source)
{
    return documentToVal(qhtml::wasm::QDomResourceImporter().parseSource(qhtml::wasm::qStringFromStdString(source)));
}

} // namespace

EMSCRIPTEN_BINDINGS(qhtml_qdom_resource_importer)
{
    emscripten::class_<qhtml::wasm::QDomResourceImporter>("QDomResourceImporter")
        .constructor<>()
        .function("normalizePath", &qhtml::wasm::QDomResourceImporter::normalizePathJs)
        .function("exists", &qhtml::wasm::QDomResourceImporter::existsJs)
        .function("readText", &qhtml::wasm::QDomResourceImporter::readTextJs)
        .function("expandedSource", &qhtml::wasm::QDomResourceImporter::expandedSourceJs)
        .function("expandImportsInSource", &qhtml::wasm::QDomResourceImporter::expandImportsInSourceJs)
        .function("parsedResourceNodeCount", &qhtml::wasm::QDomResourceImporter::parsedResourceNodeCountJs)
        .function("parsedSourceNodeCount", &qhtml::wasm::QDomResourceImporter::parsedSourceNodeCountJs)
        .function("resourcePaths", &qhtml::wasm::QDomResourceImporter::resourcePathsJs);

    emscripten::function("qhtmlResourceNormalizePath", &qhtmlResourceNormalizePath);
    emscripten::function("qhtmlResourceExists", &qhtmlResourceExists);
    emscripten::function("qhtmlReadResource", &qhtmlReadResource);
    emscripten::function("qhtmlExpandResource", &qhtmlExpandResource);
    emscripten::function("qhtmlExpandResourceImportsInSource", &qhtmlExpandResourceImportsInSource);
    emscripten::function("qhtmlParsedResourceNodeCount", &qhtmlParsedResourceNodeCount);
    emscripten::function("qhtmlResourcePaths", &qhtmlResourcePaths);
    emscripten::function("qhtmlParseSourceToObject", &qhtmlParseSourceToObject);
}
#endif
