#ifndef QHTML_RUNTIME_H
#define QHTML_RUNTIME_H

#include <QHash>
#include <QList>
#include <QObject>
#include <QString>
#include <QStringList>
#include <QVariant>
#include <QVariantMap>

#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

class QHTMLNodeTree;

class QHTMLContext : public QObject
{
public:
    explicit QHTMLContext(QObject *parent = nullptr);

    void setOwnerUuid(const QString &uuid);
    QString ownerUuid() const;
    std::string ownerUuidJs() const;

    void setSymbol(const QString &name, const QString &uuid);
    void setSymbolJs(const std::string &name, const std::string &uuid);
    bool has(const QString &name) const;
    bool hasJs(const std::string &name) const;
    QString uuidFor(const QString &name) const;
    std::string getUUID(const std::string &name) const;
    QStringList names() const;

    QVariantMap toVariantMap() const;
    QString toJson() const;
    std::string toJsonJs() const;

#ifdef __EMSCRIPTEN__
    emscripten::val toObjectJs() const;
#endif

private:
    QString m_ownerUuid;
    QVariantMap m_symbols;
};

class QHTMLElement : public QObject
{
public:
    explicit QHTMLElement(const QString &typeName = QStringLiteral("element"),
                          QHTMLNodeTree *tree = nullptr,
                          QObject *parent = nullptr);
    explicit QHTMLElement(const std::string &typeName);
    ~QHTMLElement() override = default;

    QHTMLNodeTree *tree() const;
    void setTree(QHTMLNodeTree *tree);

    QString uuid() const;
    std::string uuidJs() const;
    void setUuid(const QString &uuid);
    void setUuidJs(const std::string &uuid);

    QString typeName() const;
    std::string typeNameJs() const;
    QString kind() const;
    std::string kindJs() const;

    QString parentUuid() const;
    std::string parentUuidJs() const;
    QHTMLElement *parentElement() const;
    QHTMLElement *parentElementJs() const;

    int childCount() const;
    QHTMLElement *childAt(int index) const;
    QStringList childUuids() const;
    std::string childrenJson() const;

    bool hasProperty(const std::string &name) const;
    void setString(const std::string &name, const std::string &value);
    void setNumber(const std::string &name, double value);
    void setBool(const std::string &name, bool value);
    std::string stringProperty(const std::string &name) const;
    double numberProperty(const std::string &name) const;
    bool boolProperty(const std::string &name) const;
    std::string propertyJson(const std::string &name) const;
    std::string propertyKeysJson() const;
    bool removePropertyJs(const std::string &name);

#ifdef __EMSCRIPTEN__
    void setPropertyValue(const std::string &name, emscripten::val value);
    emscripten::val propertyValue(const std::string &name) const;
#endif

    void setSymbol(const QString &name, const QString &uuid);
    void setSymbolJs(const std::string &name, const std::string &uuid);
    bool removeSymbolJs(const std::string &name);
    QString symbolUuid(const QString &name) const;
    std::string symbolUuidJs(const std::string &name) const;
    QString symbolsJson() const;
    std::string symbolsJsonJs() const;
    QVariantMap symbols() const;

    QHTMLContext *getContext() const;
    std::string resolveSymbol(const std::string &name) const;

    bool blockSignalsJs(bool block);
    bool signalsBlockedJs() const;

#ifdef __EMSCRIPTEN__
    int connectJs(const std::string &signalName, emscripten::val callback);
    bool disconnectJs(int connectionId);
    void emitJs(const std::string &signalName, emscripten::val payload);
    void dispatchSignalJs(const std::string &signalName, emscripten::val payload);
    void dispatchPropertyChangedJs(const std::string &propertyName,
                                   emscripten::val value,
                                   emscripten::val previous);
    emscripten::val toObjectJs() const;
#endif

    QVariantMap toVariantMap() const;
    QString toJson() const;
    std::string toJsonJs() const;
    friend class QHTMLNodeTree;

    void setParentUuid(const QString &uuid);
    bool appendChildUuid(const QString &uuid);
    bool insertChildUuid(int index, const QString &uuid);
    bool removeChildUuid(const QString &uuid);
    void setPropertyVariant(const QString &name, const QVariant &value, bool notify);
    QVariant propertyVariant(const QString &name) const;

protected:


private:
    QString m_uuid;
    QString m_typeName;
    QString m_parentUuid;
    QStringList m_childUuids;
    QVariantMap m_properties;
    QVariantMap m_symbols;
    QHTMLNodeTree *m_tree = nullptr;

#ifdef __EMSCRIPTEN__
    struct JsSignalConnection {
        int id = 0;
        QString signalName;
        emscripten::val callback = emscripten::val::undefined();
    };

    int m_nextConnectionId = 1;
    QList<JsSignalConnection> m_signalConnections;
#endif
};

class QHTMLComponent : public QHTMLElement
{
public:
    explicit QHTMLComponent(const QString &componentId = QString(), QHTMLNodeTree *tree = nullptr);
    explicit QHTMLComponent(const std::string &componentId);

    QString componentId() const;
    std::string componentIdJs() const;
    void setComponentId(const QString &componentId);
    void setComponentIdJs(const std::string &componentId);

    void addPropertyName(const std::string &name);
    void addSignalName(const std::string &name);
    bool hasDeclaredProperty(const std::string &name) const;
    QStringList declaredProperties() const;
    QStringList declaredSignals() const;
    std::string declaredPropertiesJson() const;
    std::string declaredSignalsJson() const;

private:
    QString m_componentId;
    QStringList m_declaredProperties;
    QStringList m_declaredSignals;
};

class QHTMLBinding : public QObject
{
public:
    explicit QHTMLBinding(QObject *parent = nullptr);

    QString uuid() const;
    std::string uuidJs() const;
    QString sourceUuid() const;
    QString sourceProperty() const;
    QString targetUuid() const;
    QString targetProperty() const;

    void configure(const QString &sourceUuid,
                   const QString &sourceProperty,
                   const QString &targetUuid,
                   const QString &targetProperty);
    void configureJs(const std::string &sourceUuid,
                     const std::string &sourceProperty,
                     const std::string &targetUuid,
                     const std::string &targetProperty);

    bool enabled() const;
    void setEnabled(bool enabled);
    QVariantMap toVariantMap() const;
    std::string toJsonJs() const;

private:
    QString m_uuid;
    QString m_sourceUuid;
    QString m_sourceProperty;
    QString m_targetUuid;
    QString m_targetProperty;
    bool m_enabled = true;
};

class QHTMLNodeTree : public QObject
{
public:
    explicit QHTMLNodeTree(QObject *parent = nullptr);
    ~QHTMLNodeTree() override;

    QHTMLElement *createElement(const std::string &typeName);
    QHTMLComponent *createComponent(const std::string &componentId);
    QHTMLElement *createNode(const std::string &typeName);
    bool registerNode(QHTMLElement *node);
    QHTMLElement *get(const std::string &uuid) const;
    QHTMLElement *getByQString(const QString &uuid) const;
    bool contains(const std::string &uuid) const;
    bool remove(const std::string &uuid);
    int size() const;

    bool addChild(const std::string &parentUuid, const std::string &childUuid);
    bool insertChild(int index, const std::string &parentUuid, const std::string &childUuid);
    bool reparent(const std::string &childUuid, const std::string &parentUuid);
    bool detach(const std::string &childUuid);

    QHTMLContext *contextFor(const std::string &uuid) const;
    std::string resolveSymbol(const std::string &fromUuid, const std::string &name) const;
    bool setSymbol(const std::string &ownerUuid, const std::string &name, const std::string &targetUuid);

    QHTMLBinding *bindProperty(const std::string &sourceUuid,
                               const std::string &sourceProperty,
                               const std::string &targetUuid,
                               const std::string &targetProperty);
    bool removeBinding(const std::string &bindingUuid);
    int syncBindingsFrom(const std::string &sourceUuid, const std::string &sourceProperty);
    std::string bindingsJson() const;

    std::string nodesJson() const;
    std::string toJsonJs() const;

    void notifyPropertyChanged(QHTMLElement *node,
                               const QString &propertyName,
                               const QVariant &value,
                               const QVariant &previous);

private:
    QHash<QString, QHTMLElement *> m_nodes;
    QHash<QString, QHTMLBinding *> m_bindings;
    mutable QList<QHTMLContext *> m_contexts;
    int m_syncDepth = 0;
};

class QHTMLPropertyAnimation : public QObject
{
public:
    explicit QHTMLPropertyAnimation(QObject *parent = nullptr);

    void setTree(QHTMLNodeTree *tree);
    void setTargetTree(QHTMLNodeTree *tree);
    void setTargetUuid(const std::string &uuid);
    void setPropertyName(const std::string &name);
    void setDuration(int ms);
    void setStartNumber(double value);
    void setEndNumber(double value);
    void setEasing(int easingType);
    void start();
    void stop();
    bool isRunning() const;

#ifdef __EMSCRIPTEN__
    int connectJs(const std::string &signalName, emscripten::val callback);
    bool disconnectJs(int connectionId);
#endif

private:
    void emitSignal(const QString &signalName, const QVariant &payload = QVariant());

    QHTMLNodeTree *m_tree = nullptr;
    QString m_targetUuid;
    QString m_propertyName;
    QObject m_proxy;
    class QPropertyAnimation *m_animation = nullptr;

#ifdef __EMSCRIPTEN__
    struct JsSignalConnection {
        int id = 0;
        QString signalName;
        emscripten::val callback = emscripten::val::undefined();
    };

    int m_nextConnectionId = 1;
    QList<JsSignalConnection> m_signalConnections;
#endif
};

#endif // QHTML_RUNTIME_H
