#include "qhtml_runtime.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>

using emscripten::allow_raw_pointers;
using emscripten::base;
using emscripten::class_;

EMSCRIPTEN_BINDINGS(qhtml_runtime_core)
{
    class_<QHTMLContext>("QHTMLContext")
        .function("ownerUuid", &QHTMLContext::ownerUuidJs)
        .function("setSymbol", &QHTMLContext::setSymbolJs)
        .function("has", &QHTMLContext::hasJs)
        .function("getUUID", &QHTMLContext::getUUID)
        .function("toJson", &QHTMLContext::toJsonJs)
        .function("toObject", &QHTMLContext::toObjectJs);

    class_<QHTMLElement>("QHTMLElement")
        .constructor<>()
        .constructor<std::string>()
        .function("uuid", &QHTMLElement::uuidJs)
        .function("setUuid", &QHTMLElement::setUuidJs)
        .function("kind", &QHTMLElement::kindJs)
        .function("typeName", &QHTMLElement::typeNameJs)
        .function("parentUuid", &QHTMLElement::parentUuidJs)
        .function("parent", &QHTMLElement::parentElementJs, allow_raw_pointers())
        .function("parentElement", &QHTMLElement::parentElementJs, allow_raw_pointers())
        .function("childCount", &QHTMLElement::childCount)
        .function("childAt", &QHTMLElement::childAt, allow_raw_pointers())
        .function("children", &QHTMLElement::childrenJson)
        .function("hasProperty", &QHTMLElement::hasProperty)
        .function("setString", &QHTMLElement::setString)
        .function("setNumber", &QHTMLElement::setNumber)
        .function("setBool", &QHTMLElement::setBool)
        .function("setPropertyValue", &QHTMLElement::setPropertyValue)
        .function("propertyValue", &QHTMLElement::propertyValue)
        .function("stringProperty", &QHTMLElement::stringProperty)
        .function("numberProperty", &QHTMLElement::numberProperty)
        .function("boolProperty", &QHTMLElement::boolProperty)
        .function("propertyJson", &QHTMLElement::propertyJson)
        .function("propertyKeys", &QHTMLElement::propertyKeysJson)
        .function("removeProperty", &QHTMLElement::removePropertyJs)
        .function("setSymbol", &QHTMLElement::setSymbolJs)
        .function("removeSymbol", &QHTMLElement::removeSymbolJs)
        .function("symbolUuid", &QHTMLElement::symbolUuidJs)
        .function("symbolsJson", &QHTMLElement::symbolsJsonJs)
        .function("getContext", &QHTMLElement::getContext, allow_raw_pointers())
        .function("resolveSymbol", &QHTMLElement::resolveSymbol)
        .function("blockSignals", &QHTMLElement::blockSignalsJs)
        .function("signalsBlocked", &QHTMLElement::signalsBlockedJs)
        .function("connect", &QHTMLElement::connectJs)
        .function("disconnect", &QHTMLElement::disconnectJs)
        .function("emit", &QHTMLElement::emitJs)
        .function("dispatchSignal", &QHTMLElement::dispatchSignalJs)
        .function("dispatchPropertyChanged", &QHTMLElement::dispatchPropertyChangedJs)
        .function("toJson", &QHTMLElement::toJsonJs)
        .function("toObject", &QHTMLElement::toObjectJs);

    class_<QHTMLComponent, base<QHTMLElement>>("QHTMLComponent")
        .constructor<>()
        .constructor<std::string>()
        .function("componentId", &QHTMLComponent::componentIdJs)
        .function("setComponentId", &QHTMLComponent::setComponentIdJs)
        .function("addPropertyName", &QHTMLComponent::addPropertyName)
        .function("addSignalName", &QHTMLComponent::addSignalName)
        .function("hasDeclaredProperty", &QHTMLComponent::hasDeclaredProperty)
        .function("declaredPropertiesJson", &QHTMLComponent::declaredPropertiesJson)
        .function("declaredSignalsJson", &QHTMLComponent::declaredSignalsJson);

    class_<QHTMLBinding>("QHTMLBinding")
        .function("uuid", &QHTMLBinding::uuidJs)
        .function("configure", &QHTMLBinding::configureJs)
        .function("enabled", &QHTMLBinding::enabled)
        .function("setEnabled", &QHTMLBinding::setEnabled)
        .function("toJson", &QHTMLBinding::toJsonJs);

    class_<QHTMLNodeTree>("QHTMLNodeTree")
        .constructor<>()
        .function("createElement", &QHTMLNodeTree::createElement, allow_raw_pointers())
        .function("createComponent", &QHTMLNodeTree::createComponent, allow_raw_pointers())
        .function("createNode", &QHTMLNodeTree::createNode, allow_raw_pointers())
        .function("registerNode", &QHTMLNodeTree::registerNode, allow_raw_pointers())
        .function("get", &QHTMLNodeTree::get, allow_raw_pointers())
        .function("contains", &QHTMLNodeTree::contains)
        .function("remove", &QHTMLNodeTree::remove)
        .function("size", &QHTMLNodeTree::size)
        .function("addChild", &QHTMLNodeTree::addChild)
        .function("insertChild", &QHTMLNodeTree::insertChild)
        .function("reparent", &QHTMLNodeTree::reparent)
        .function("detach", &QHTMLNodeTree::detach)
        .function("contextFor", &QHTMLNodeTree::contextFor, allow_raw_pointers())
        .function("resolveSymbol", &QHTMLNodeTree::resolveSymbol)
        .function("setSymbol", &QHTMLNodeTree::setSymbol)
        .function("bindProperty", &QHTMLNodeTree::bindProperty, allow_raw_pointers())
        .function("removeBinding", &QHTMLNodeTree::removeBinding)
        .function("syncBindingsFrom", &QHTMLNodeTree::syncBindingsFrom)
        .function("bindingsJson", &QHTMLNodeTree::bindingsJson)
        .function("nodesJson", &QHTMLNodeTree::nodesJson)
        .function("toJson", &QHTMLNodeTree::toJsonJs);

    class_<QHTMLPropertyAnimation>("QHTMLPropertyAnimation")
        .constructor<>()
        .function("setTree", &QHTMLPropertyAnimation::setTree, allow_raw_pointers())
        .function("setTargetTree", &QHTMLPropertyAnimation::setTargetTree, allow_raw_pointers())
        .function("setTargetUuid", &QHTMLPropertyAnimation::setTargetUuid)
        .function("setPropertyName", &QHTMLPropertyAnimation::setPropertyName)
        .function("setDuration", &QHTMLPropertyAnimation::setDuration)
        .function("setStartNumber", &QHTMLPropertyAnimation::setStartNumber)
        .function("setEndNumber", &QHTMLPropertyAnimation::setEndNumber)
        .function("setEasing", &QHTMLPropertyAnimation::setEasing)
        .function("start", &QHTMLPropertyAnimation::start)
        .function("stop", &QHTMLPropertyAnimation::stop)
        .function("isRunning", &QHTMLPropertyAnimation::isRunning)
        .function("connect", &QHTMLPropertyAnimation::connectJs)
        .function("disconnect", &QHTMLPropertyAnimation::disconnectJs);
}
#endif
