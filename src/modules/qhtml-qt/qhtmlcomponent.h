#ifndef QHTMLCOMPONENT_H
#define QHTMLCOMPONENT_H

#include <QObject>
#include <QStringList>
#include <QVariant>

#include <emscripten/val.h>

#include <string>
#include <unordered_map>

class QHtmlComponent : public QObject
{
    Q_OBJECT

public:
    explicit QHtmlComponent(QObject *parent = nullptr);
    ~QHtmlComponent() override = default;

    void setDefinition(const std::string &componentName,
                       const std::string &properties,
                       const std::string &signalNames);
    void addPropertyName(const std::string &name);
    void addSignalName(const std::string &name);
    bool build();
    bool create();
    bool isReady() const;
    bool hasInstance() const;
    bool hasProperty(const std::string &name) const;
    bool blockSignals(bool block);
    bool signalsBlocked() const;

    void setContextPropertyValue(const std::string &name, emscripten::val value);
    void setContextComponent(const std::string &name, QHtmlComponent *component);
    void setPropertyValue(const std::string &name, emscripten::val value);
    void setString(const std::string &name, const std::string &value);
    void setNumber(const std::string &name, double value);
    void setBool(const std::string &name, bool value);

    emscripten::val propertyValue(const std::string &name) const;
    std::string propertyJson(const std::string &name) const;
    std::string propertyKeysJson() const;
    std::string errorsJson() const;
    std::string source() const;

    QObject *instanceObject();

private:
    static QString normalizedName(const std::string &name);
    static std::string quoteJsonString(const QString &value);
    static std::string variantJson(const QVariant &value);
    void rememberPropertyName(const QString &name);
    void clearStoredValue(const QString &name);

    QString m_componentName;
    QStringList m_propertyNames;
    QStringList m_signalNames;
    std::unordered_map<std::string, emscripten::val> m_storedValues;
};

#endif // QHTMLCOMPONENT_H
