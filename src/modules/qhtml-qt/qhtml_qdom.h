// qhtml_qdom.h
// QtCore QObject-backed symbolic QDom model for Qt/WASM builds.
//
// The classes here do not mount browser DOM or evaluate JavaScript.  They
// preserve QHTML parser output as a QObject tree that can be walked and mutated
// from JavaScript through embind.

#ifndef QHTML_QDOM_H
#define QHTML_QDOM_H

#include <QList>
#include <QObject>
#include <QSet>
#include <QString>
#include <QStringList>
#include <QVariant>
#include <QVariantList>
#include <QVariantMap>

#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/val.h>
#endif

class QDomNode : public QObject
{
    Q_OBJECT

public:
    explicit QDomNode(const QString &kind = QStringLiteral("node"), QObject *parent = nullptr);
    explicit QDomNode(const std::string &kind);
    ~QDomNode() override = default;

    QString kind() const;
    std::string kindJs() const;

    std::string objectNameJs() const;
    void setObjectNameJs(const std::string &name);
    QDomNode *parentNode() const;
    void setParentNode(QDomNode *parent);

    QString uuid() const;
    std::string uuidJs() const;
    void setUuid(const QString &uuid);
    void setUuidJs(const std::string &uuid);

    QString domUuid() const;
    std::string domUuidJs() const;
    void setDomUuid(const QString &uuid);
    void setDomUuidJs(const std::string &uuid);

    void addChild(QDomNode *node);
    void insertChild(int index, QDomNode *node);
    bool removeChild(QDomNode *node);
    QDomNode *childAt(int index) const;
    int childCount() const;
    std::string childrenJson() const;

    QDomNode *findByUuid(const QString &uuid) const;
    QDomNode *findByUuidJs(const std::string &uuid) const;
    QDomNode *findByKind(const QString &kind) const;
    QDomNode *findByKindJs(const std::string &kind) const;
    QDomNode *findByName(const QString &name) const;
    QDomNode *findByNameJs(const std::string &name) const;
    QDomNode *findByTagName(const QString &tagName) const;
    QDomNode *findByTagNameJs(const std::string &tagName) const;
    QDomNode *find(const QString &query) const;
    QDomNode *findJs(const std::string &query) const;

    void setMetaValue(const QString &name, const QVariant &value);
    void setMetaValueJs(const std::string &name, const std::string &value);
    QString metaValue(const QString &name) const;
    std::string metaValueJs(const std::string &name) const;
    QString metaJson() const;
    std::string metaJsonJs() const;
    void setMetaJson(const QString &json);
    void setMetaJsonJs(const std::string &json);

    void setAnchorRule(const QString &name, const QString &target);
    void setAnchorRuleJs(const std::string &name, const std::string &target);
    QString anchorRule(const QString &name) const;
    std::string anchorRuleJs(const std::string &name) const;
    QString anchorRulesJson() const;
    std::string anchorRulesJsonJs() const;

    void setStringProperty(const std::string &name, const std::string &value);
    void setNumberProperty(const std::string &name, double value);
    void setBoolProperty(const std::string &name, bool value);
    std::string stringProperty(const std::string &name) const;
    double numberProperty(const std::string &name) const;
    bool boolProperty(const std::string &name) const;
    bool hasProperty(const std::string &name) const;
    std::string propertyJson(const std::string &name) const;
    std::string propertyKeysJson() const;

    QVariantMap toVariantMap() const;
    QString toJson() const;
    std::string toJsonJs() const;

#ifdef __EMSCRIPTEN__
    void setPropertyValueJs(const std::string &name, emscripten::val value);
    emscripten::val propertyValueJs(const std::string &name) const;
    int connectJs(const std::string &signalName, emscripten::val callback);
    bool disconnectJs(int connectionId);
    void emitJs(const std::string &signalName, emscripten::val payload);
    void dispatchSignalJs(const std::string &signalName, emscripten::val payload);
    void dispatchPropertyChangedJs(const std::string &propertyName, emscripten::val value, emscripten::val previous);
    emscripten::val toObjectJs() const;
#endif

protected:
    void setKindForSubclass(const QString &kind);
    virtual void writePayload(QVariantMap &out) const;
    const QList<QDomNode *> &childNodes() const;

private:
    QString m_kind;
    QString m_uuid;
    QString m_domUuid;
    QVariantMap m_meta;
    QList<QDomNode *> m_childNodes;

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

class QDomDocumentNode : public QDomNode
{
public:
    explicit QDomDocumentNode(const QString &source = QString(), QObject *parent = nullptr);
    explicit QDomDocumentNode(const std::string &source);

    QString source() const;
    std::string sourceJs() const;
    void setSource(const QString &source);
    void setSourceJs(const std::string &source);

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_source;
};

class QDomElementNode : public QDomNode
{
public:
    explicit QDomElementNode(const QString &tagName = QString(), QObject *parent = nullptr);
    explicit QDomElementNode(const std::string &tagName);

    QString tagName() const;
    std::string tagNameJs() const;
    void setTagName(const QString &tagName);
    void setTagNameJs(const std::string &tagName);

    void setSelectorChain(const QStringList &selectors);
    QString selectorChainJson() const;
    std::string selectorChainJsonJs() const;

    void setAttribute(const QString &name, const QVariant &value);
    void setAttributeJs(const std::string &name, const std::string &value);
    QString attribute(const QString &name) const;
    std::string attributeJs(const std::string &name) const;
    bool hasAttribute(const QString &name) const;
    bool hasAttributeJs(const std::string &name) const;
    QString attributesJson() const;
    std::string attributesJsonJs() const;

    void setTextContent(const QString &value);
    void setTextContentJs(const std::string &value);
    QString textContent() const;
    std::string textContentJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_tagName;
    QStringList m_selectorChain;
    QVariantMap m_attributes;
    QString m_textContent;
};

class QDomTextNode : public QDomNode
{
public:
    explicit QDomTextNode(const QString &value = QString(), QObject *parent = nullptr);
    explicit QDomTextNode(const std::string &value);

    QString value() const;
    std::string valueJs() const;
    void setValue(const QString &value);
    void setValueJs(const std::string &value);

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_value;
};

class QDomRawHtmlNode : public QDomNode
{
public:
    explicit QDomRawHtmlNode(const QString &html = QString(), QObject *parent = nullptr);
    explicit QDomRawHtmlNode(const std::string &html);

    QString html() const;
    std::string htmlJs() const;
    void setHtml(const QString &html);
    void setHtmlJs(const std::string &html);

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_html;
};

class QDomModelNode : public QDomNode
{
public:
    explicit QDomModelNode(const QString &name = QString(), QObject *parent = nullptr);
    explicit QDomModelNode(const std::string &name);

    QString name() const;
    std::string nameJs() const;
    void setName(const QString &name);
    void setNameJs(const std::string &name);
    void setEntriesJson(const QString &json);
    void setEntriesJsonJs(const std::string &json);
    QString entriesJson() const;
    std::string entriesJsonJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_name;
    QVariantList m_entries;
};

class QDomRepeaterNode : public QDomNode
{
public:
    explicit QDomRepeaterNode(const QString &repeaterId = QString(), QObject *parent = nullptr);
    explicit QDomRepeaterNode(const std::string &repeaterId);

    QString repeaterId() const;
    std::string repeaterIdJs() const;
    void setRepeaterId(const QString &repeaterId);
    void setRepeaterIdJs(const std::string &repeaterId);
    QString modelRef() const;
    std::string modelRefJs() const;
    void setModelRef(const QString &modelRef);
    void setModelRefJs(const std::string &modelRef);

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_repeaterId;
    QString m_modelRef;
};

class QDomComponentNode : public QDomNode
{
public:
    explicit QDomComponentNode(const QString &componentId = QString(), QObject *parent = nullptr);
    explicit QDomComponentNode(const std::string &componentId);

    QString componentId() const;
    std::string componentIdJs() const;
    void setComponentId(const QString &componentId);
    void setComponentIdJs(const std::string &componentId);
    QString definitionType() const;
    std::string definitionTypeJs() const;
    void setDefinitionType(const QString &definitionType);
    void setDefinitionTypeJs(const std::string &definitionType);
    void setDefinitionJson(const QString &json);
    void setDefinitionJsonJs(const std::string &json);
    QString definitionJson() const;
    std::string definitionJsonJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_componentId;
    QString m_definitionType;
    QVariantMap m_definition;
};

class QDomComponentInstanceNode : public QDomNode
{
public:
    explicit QDomComponentInstanceNode(const QString &componentId = QString(), QObject *parent = nullptr);
    explicit QDomComponentInstanceNode(const std::string &componentId);

    QString componentId() const;
    std::string componentIdJs() const;
    void setComponentId(const QString &componentId);
    void setComponentIdJs(const std::string &componentId);
    QString alias() const;
    std::string aliasJs() const;
    void setAlias(const QString &alias);
    void setAliasJs(const std::string &alias);
    void setAttribute(const QString &name, const QVariant &value);
    void setAttributeJs(const std::string &name, const std::string &value);
    QString attribute(const QString &name) const;
    std::string attributeJs(const std::string &name) const;
    QString attributesJson() const;
    std::string attributesJsonJs() const;
    void setProp(const QString &name, const QVariant &value);
    void setPropJs(const std::string &name, const std::string &value);
    QString prop(const QString &name) const;
    std::string propJs(const std::string &name) const;
    QString propsJson() const;
    std::string propsJsonJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_componentId;
    QString m_alias;
    QVariantMap m_attributes;
    QVariantMap m_props;
};

class QDomTemplateInstanceNode : public QDomComponentInstanceNode
{
public:
    explicit QDomTemplateInstanceNode(const QString &templateId = QString(), QObject *parent = nullptr);
    explicit QDomTemplateInstanceNode(const std::string &templateId);
};

class QDomStructNode : public QDomNode
{
public:
    explicit QDomStructNode(const QString &structId = QString(), QObject *parent = nullptr);
    explicit QDomStructNode(const std::string &structId);

    QString structId() const;
    std::string structIdJs() const;
    void setStructId(const QString &structId);
    void setStructIdJs(const std::string &structId);
    void setFieldsJson(const QString &json);
    void setFieldsJsonJs(const std::string &json);
    QString fieldsJson() const;
    std::string fieldsJsonJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_structId;
    QVariantList m_fields;
};

class QDomStructInstanceNode : public QDomNode
{
public:
    explicit QDomStructInstanceNode(const QString &structId = QString(), QObject *parent = nullptr);
    explicit QDomStructInstanceNode(const std::string &structId);

    QString structId() const;
    std::string structIdJs() const;
    void setStructId(const QString &structId);
    void setStructIdJs(const std::string &structId);
    QString alias() const;
    std::string aliasJs() const;
    void setAlias(const QString &alias);
    void setAliasJs(const std::string &alias);
    void setProp(const QString &name, const QVariant &value);
    void setPropJs(const std::string &name, const std::string &value);
    QString prop(const QString &name) const;
    std::string propJs(const std::string &name) const;
    QString propsJson() const;
    std::string propsJsonJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_structId;
    QString m_alias;
    QVariantMap m_props;
};

class QDomClassNode : public QDomNode
{
public:
    explicit QDomClassNode(const QString &classId = QString(), QObject *parent = nullptr);
    explicit QDomClassNode(const std::string &classId);

    QString classId() const;
    std::string classIdJs() const;
    void setClassId(const QString &classId);
    void setClassIdJs(const std::string &classId);
    QString extendsClassId() const;
    std::string extendsClassIdJs() const;
    void setExtendsClassId(const QString &extendsClassId);
    void setExtendsClassIdJs(const std::string &extendsClassId);
    void setConstructorJson(const QString &json);
    void setConstructorJsonJs(const std::string &json);
    QString constructorJson() const;
    std::string constructorJsonJs() const;
    void setMethodsJson(const QString &json);
    void setMethodsJsonJs(const std::string &json);
    QString methodsJson() const;
    std::string methodsJsonJs() const;
    void setSlotDeclarationsJson(const QString &json);
    void setSlotDeclarationsJsonJs(const std::string &json);
    QString slotDeclarationsJson() const;
    std::string slotDeclarationsJsonJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_classId;
    QString m_extendsClassId;
    QVariantMap m_constructorDefinition;
    QVariantList m_methods;
    QVariantList m_slotDeclarations;
};

class QDomClassInstanceNode : public QDomNode
{
public:
    explicit QDomClassInstanceNode(const QString &classId = QString(), QObject *parent = nullptr);
    explicit QDomClassInstanceNode(const std::string &classId);

    QString classId() const;
    std::string classIdJs() const;
    void setClassId(const QString &classId);
    void setClassIdJs(const std::string &classId);
    QString alias() const;
    std::string aliasJs() const;
    void setAlias(const QString &alias);
    void setAliasJs(const std::string &alias);
    QString argumentSource() const;
    std::string argumentSourceJs() const;
    void setArgumentSource(const QString &argumentSource);
    void setArgumentSourceJs(const std::string &argumentSource);
    void setArguments(const QStringList &arguments);
    QString argumentsJson() const;
    std::string argumentsJsonJs() const;
    void setAttribute(const QString &name, const QVariant &value);
    void setAttributeJs(const std::string &name, const std::string &value);
    QString attribute(const QString &name) const;
    std::string attributeJs(const std::string &name) const;
    QString attributesJson() const;
    std::string attributesJsonJs() const;
    void setProp(const QString &name, const QVariant &value);
    void setPropJs(const std::string &name, const std::string &value);
    QString prop(const QString &name) const;
    std::string propJs(const std::string &name) const;
    QString propsJson() const;
    std::string propsJsonJs() const;

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_classId;
    QString m_alias;
    QString m_argumentSource;
    QStringList m_arguments;
    QVariantMap m_attributes;
    QVariantMap m_props;
};

class QDomSlotNode : public QDomNode
{
public:
    explicit QDomSlotNode(const QString &name = QString(), QObject *parent = nullptr);
    explicit QDomSlotNode(const std::string &name);

    QString name() const;
    std::string nameJs() const;
    void setName(const QString &name);
    void setNameJs(const std::string &name);

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_name;
};

class QDomSlotDefaultNode : public QDomSlotNode
{
public:
    explicit QDomSlotDefaultNode(const QString &name = QString(), QObject *parent = nullptr);
    explicit QDomSlotDefaultNode(const std::string &name);
};

class QDomScriptRuleNode : public QDomNode
{
public:
    explicit QDomScriptRuleNode(const QString &name = QString(), QObject *parent = nullptr);
    explicit QDomScriptRuleNode(const std::string &name);

    QString name() const;
    std::string nameJs() const;
    void setName(const QString &name);
    void setNameJs(const std::string &name);
    QString parameters() const;
    std::string parametersJs() const;
    void setParameters(const QString &parameters);
    void setParametersJs(const std::string &parameters);
    QString body() const;
    std::string bodyJs() const;
    void setBody(const QString &body);
    void setBodyJs(const std::string &body);

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_name;
    QString m_parameters;
    QString m_body;
};

class QDomColorNode : public QDomNode
{
public:
    explicit QDomColorNode(const QString &name = QString(), QObject *parent = nullptr);
    explicit QDomColorNode(const std::string &name);

    QString name() const;
    std::string nameJs() const;
    void setName(const QString &name);
    void setNameJs(const std::string &name);
    QString value() const;
    std::string valueJs() const;
    void setValue(const QString &value);
    void setValueJs(const std::string &value);

protected:
    void writePayload(QVariantMap &out) const override;

private:
    QString m_name;
    QString m_value;
};

class QDomBuilder
{
public:
    QDomBuilder() = default;

    QDomDocumentNode *fromASTJson(const std::string &json);

#ifdef __EMSCRIPTEN__
    QDomDocumentNode *fromAST(emscripten::val ast);
#endif

private:
    QDomNode *convertItem(const QVariantMap &item);
    QDomNode *convertElement(const QVariantMap &item);
    QDomNode *createRenderableNode(const QString &selector, const QVariantMap &item);
    void appendConvertedItems(QDomNode *parent, const QVariantList &items);
    void applyProperty(QDomNode *node, const QVariantMap &item);
    void applyDeclaredProperty(QDomNode *node, const QVariantMap &item);
    bool applyAnchorDirective(QDomNode *node, const QVariantMap &item);
    bool applyBehaviorDirective(QDomNode *node, const QVariantMap &item);
    void copyCommonMeta(QDomNode *node, const QVariantMap &item);
    void registerDefinition(const QVariantMap &item, QDomNode *node);

    QSet<QString> m_componentDefinitions;
    QSet<QString> m_templateDefinitions;
    QSet<QString> m_classDefinitions;
    QSet<QString> m_structDefinitions;
};

class QDomDocument
{
public:
    QDomDocument() = default;
    ~QDomDocument();

    QDomDocument *fromASTJson(const std::string &json);
    QDomDocumentNode *root() const;
    QDomElementNode *createElement(const std::string &tagName) const;
    QDomTextNode *createText(const std::string &text) const;
    QDomNode *createInstance(const std::string &typeName, const std::string &name, const std::string &argsJson) const;
    QDomNode *findByUuid(const std::string &uuid) const;
    QDomNode *findByName(const std::string &name) const;
    QDomNode *findByKind(const std::string &kind) const;
    QDomNode *find(const std::string &query) const;

#ifdef __EMSCRIPTEN__
    QDomDocument *fromAST(emscripten::val ast);
#endif

private:
    QDomBuilder m_builder;
    QDomDocumentNode *m_root = nullptr;
};

#endif // QHTML_QDOM_H
