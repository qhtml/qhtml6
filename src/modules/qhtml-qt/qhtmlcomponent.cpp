#include "qhtmlcomponent.h"

#include <QByteArray>

using emscripten::val;

QHtmlComponent::QHtmlComponent(QObject *parent)
    : QObject(parent)
{
}

void QHtmlComponent::setDefinition(const std::string &componentName,
                                   const std::string &,
                                   const std::string &)
{
    m_componentName = normalizedName(componentName);
    m_propertyNames.clear();
    m_signalNames.clear();
    m_storedValues.clear();
    if (!m_componentName.isEmpty()) {
        setObjectName(m_componentName);
    }
}

void QHtmlComponent::addPropertyName(const std::string &name)
{
    rememberPropertyName(normalizedName(name));
}

void QHtmlComponent::addSignalName(const std::string &name)
{
    const QString key = normalizedName(name);
    if (!key.isEmpty() && !m_signalNames.contains(key)) {
        m_signalNames.append(key);
    }
}

bool QHtmlComponent::build()
{
    return true;
}

bool QHtmlComponent::create()
{
    return true;
}

bool QHtmlComponent::isReady() const
{
    return true;
}

bool QHtmlComponent::hasInstance() const
{
    return true;
}

bool QHtmlComponent::hasProperty(const std::string &name) const
{
    const QString key = normalizedName(name);
    if (key.isEmpty()) {
        return false;
    }
    if (m_propertyNames.contains(key)) {
        return true;
    }
    if (m_storedValues.find(key.toStdString()) != m_storedValues.end()) {
        return true;
    }
    return dynamicPropertyNames().contains(key.toUtf8());
}

bool QHtmlComponent::blockSignals(bool block)
{
    return QObject::blockSignals(block);
}

bool QHtmlComponent::signalsBlocked() const
{
    return QObject::signalsBlocked();
}

void QHtmlComponent::setContextPropertyValue(const std::string &name, val value)
{
    setPropertyValue(name, value);
}

void QHtmlComponent::setContextComponent(const std::string &name, QHtmlComponent *component)
{
    const QString key = normalizedName(name);
    if (!key.isEmpty()) {
        rememberPropertyName(key);
        clearStoredValue(key);
        setProperty(key.toUtf8().constData(), QVariant::fromValue<QObject *>(component ? component->instanceObject() : nullptr));
    }
}

void QHtmlComponent::setPropertyValue(const std::string &name, val value)
{
    const QString key = normalizedName(name);
    if (key.isEmpty()) {
        return;
    }
    rememberPropertyName(key);
    const std::string storageKey = key.toStdString();
    m_storedValues.erase(storageKey);
    if (value.isUndefined() || value.isNull()) {
        setProperty(key.toUtf8().constData(), QVariant());
    } else if (value.typeOf().as<std::string>() == "number") {
        setProperty(key.toUtf8().constData(), value.as<double>());
    } else if (value.typeOf().as<std::string>() == "boolean") {
        setProperty(key.toUtf8().constData(), value.as<bool>());
    } else if (value.typeOf().as<std::string>() == "string") {
        setProperty(key.toUtf8().constData(), QString::fromStdString(value.as<std::string>()));
    } else {
        m_storedValues.emplace(storageKey, value);
        setProperty(key.toUtf8().constData(), QVariant(QStringLiteral("[object]")));
    }
}

void QHtmlComponent::setString(const std::string &name, const std::string &value)
{
    const QString key = normalizedName(name);
    if (!key.isEmpty()) {
        rememberPropertyName(key);
        clearStoredValue(key);
        setProperty(key.toUtf8().constData(), QString::fromStdString(value));
    }
}

void QHtmlComponent::setNumber(const std::string &name, double value)
{
    const QString key = normalizedName(name);
    if (!key.isEmpty()) {
        rememberPropertyName(key);
        clearStoredValue(key);
        setProperty(key.toUtf8().constData(), value);
    }
}

void QHtmlComponent::setBool(const std::string &name, bool value)
{
    const QString key = normalizedName(name);
    if (!key.isEmpty()) {
        rememberPropertyName(key);
        clearStoredValue(key);
        setProperty(key.toUtf8().constData(), value);
    }
}

val QHtmlComponent::propertyValue(const std::string &name) const
{
    const QString key = normalizedName(name);
    if (key.isEmpty()) {
        return val::undefined();
    }
    const auto stored = m_storedValues.find(key.toStdString());
    if (stored != m_storedValues.end()) {
        return stored->second;
    }
    const QVariant value = property(key.toUtf8().constData());
    if (!value.isValid()) {
        return val::undefined();
    }
    if (value.metaType().id() == QMetaType::Bool) {
        return val(value.toBool());
    }
    if (value.canConvert<double>() && value.metaType().id() != QMetaType::QString) {
        return val(value.toDouble());
    }
    return val(value.toString().toStdString());
}

std::string QHtmlComponent::propertyJson(const std::string &name) const
{
    const QString key = normalizedName(name);
    if (key.isEmpty()) {
        return "null";
    }
    const auto stored = m_storedValues.find(key.toStdString());
    if (stored != m_storedValues.end()) {
        return "null";
    }
    return variantJson(property(key.toUtf8().constData()));
}

std::string QHtmlComponent::propertyKeysJson() const
{
    std::string out = "[";
    bool first = true;
    for (const QString &name : m_propertyNames) {
        if (!first) {
            out += ",";
        }
        out += quoteJsonString(name);
        first = false;
    }
    for (const QByteArray &nameBytes : dynamicPropertyNames()) {
        const QString name = QString::fromUtf8(nameBytes);
        if (m_propertyNames.contains(name)) {
            continue;
        }
        if (!first) {
            out += ",";
        }
        out += quoteJsonString(name);
        first = false;
    }
    out += "]";
    return out;
}

std::string QHtmlComponent::errorsJson() const
{
    return "[]";
}

std::string QHtmlComponent::source() const
{
    return "";
}

QObject *QHtmlComponent::instanceObject()
{
    return this;
}

QString QHtmlComponent::normalizedName(const std::string &name)
{
    return QString::fromStdString(name).trimmed();
}

std::string QHtmlComponent::quoteJsonString(const QString &value)
{
    std::string out = "\"";
    const std::string text = value.toStdString();
    for (char ch : text) {
        switch (ch) {
        case '\\':
            out += "\\\\";
            break;
        case '"':
            out += "\\\"";
            break;
        case '\n':
            out += "\\n";
            break;
        case '\r':
            out += "\\r";
            break;
        case '\t':
            out += "\\t";
            break;
        default:
            out += ch;
            break;
        }
    }
    out += "\"";
    return out;
}

std::string QHtmlComponent::variantJson(const QVariant &value)
{
    if (!value.isValid()) {
        return "null";
    }
    if (value.metaType().id() == QMetaType::Bool) {
        return value.toBool() ? "true" : "false";
    }
    if (value.canConvert<double>() && value.metaType().id() != QMetaType::QString) {
        return std::to_string(value.toDouble());
    }
    return quoteJsonString(value.toString());
}

void QHtmlComponent::rememberPropertyName(const QString &name)
{
    if (!name.isEmpty() && !m_propertyNames.contains(name)) {
        m_propertyNames.append(name);
    }
}

void QHtmlComponent::clearStoredValue(const QString &name)
{
    m_storedValues.erase(name.toStdString());
}
