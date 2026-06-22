#include <QCoreApplication>
#include <QAbstractAnimation>
#include <QAnimationGroup>
#include <QObject>
#include <QParallelAnimationGroup>
#include <QSequentialAnimationGroup>
#include <QTimer>
#include <QVariant>
#include <QPropertyAnimation>
#include <QHash>
#include <QString>
#include <QByteArray>
#include <QEasingCurve>
#include <QDebug>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QJsonValue>
#include <QMetaType>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <memory>
#include <string>
#include "qhtml_parser.h"
#include "qhtml_qdom.h"

using emscripten::class_;
using emscripten::function;
using emscripten::val;

namespace {

QVariant jsonToVariant(const std::string &json)
{
    QJsonParseError error;
    const QJsonDocument doc = QJsonDocument::fromJson(QByteArray::fromStdString(json), &error);
    if (error.error != QJsonParseError::NoError || doc.isNull()) {
        return QString::fromStdString(json);
    }
    return doc.toVariant();
}

std::string variantToJson(const QVariant &value)
{
    if (!value.isValid()) {
        return "null";
    }

    const QJsonValue jsonValue = QJsonValue::fromVariant(value);
    if (jsonValue.isObject()) {
        return QJsonDocument(jsonValue.toObject()).toJson(QJsonDocument::Compact).toStdString();
    }
    if (jsonValue.isArray()) {
        return QJsonDocument(jsonValue.toArray()).toJson(QJsonDocument::Compact).toStdString();
    }

    QJsonArray wrapped;
    wrapped.append(jsonValue);
    std::string wrappedJson = QJsonDocument(wrapped).toJson(QJsonDocument::Compact).toStdString();
    if (wrappedJson.size() >= 2) {
        return wrappedJson.substr(1, wrappedJson.size() - 2);
    }
    return "null";
}

} // namespace

class JsQObject : public QObject {
    Q_OBJECT

public:
    explicit JsQObject(QObject *parent = nullptr) : QObject(parent) {}

    void setObjectNameJs(const std::string &name) {
        setObjectName(QString::fromStdString(name));
        emitSignal("objectNameChanged");
    }

    std::string objectNameJs() const {
        return objectName().toStdString();
    }

    JsQObject *parentJs() const {
        return qobject_cast<JsQObject *>(parent());
    }

    void setParentJs(JsQObject *parentObject) {
        setParent(parentObject);
    }

    JsQObject *childAt(int index) const {
        const auto childList = children();
        if (index < 0 || index >= childList.size())
            return nullptr;
        return qobject_cast<JsQObject *>(childList.at(index));
    }

    int childCount() const {
        return children().size();
    }

    std::string childrenJson() const {
        QVariantList out;
        for (QObject *child : children()) {
            QVariantMap item;
            item.insert(QStringLiteral("objectName"), child->objectName());
            item.insert(QStringLiteral("className"), QString::fromUtf8(child->metaObject()->className()));
            out.append(item);
        }
        return variantToJson(out);
    }

    void setString(const std::string &name, const std::string &value) {
        setProperty(name.c_str(), QString::fromStdString(value));
        emitSignal(name + "Changed");
    }

    void setNumber(const std::string &name, double value) {
        setProperty(name.c_str(), value);
        emitSignal(name + "Changed");
    }

    void setBool(const std::string &name, bool value) {
        setProperty(name.c_str(), value);
        emitSignal(name + "Changed");
    }

    void setPropertyValue(const std::string &name, val value) {
        if (value.isUndefined()) {
            setProperty(name.c_str(), QVariant());
        } else {
            const std::string json = val::global("JSON").call<std::string>("stringify", value);
            setProperty(name.c_str(), jsonToVariant(json));
        }
        emitSignalWithPayload(name + "Changed", value);
    }

    std::string getString(const std::string &name) const {
        return property(name.c_str()).toString().toStdString();
    }

    double getNumber(const std::string &name) const {
        return property(name.c_str()).toDouble();
    }

    bool getBool(const std::string &name) const {
        return property(name.c_str()).toBool();
    }

    bool blockSignalsJs(bool block) {
        return blockSignals(block);
    }

    bool signalsBlockedJs() const {
        return signalsBlocked();
    }

    val propertyValue(const std::string &name) const {
        return val::global("JSON").call<val>("parse", propertyJson(name));
    }

    std::string propertyJson(const std::string &name) const {
        return variantToJson(property(name.c_str()));
    }

    std::string propertyKeys() const {
        QStringList keys;
        for (const QByteArray &name : dynamicPropertyNames()) {
            keys.append(QString::fromUtf8(name));
        }
        return variantToJson(keys);
    }

    int connectJs(const std::string &signalName, val callback) {
        if (callback.isUndefined() || callback.isNull())
            return 0;

        const int id = nextConnectionId++;
        callbacks.insert(id, {id, QString::fromStdString(signalName), callback});
        return id;
    }

    bool disconnectJs(int connectionId) {
        return callbacks.remove(connectionId) > 0;
    }

    void emitSignal(const std::string &signalName) {
        emitSignalWithPayload(signalName, val::undefined());
    }

    void emitSignalWithPayload(const std::string &signalName, val payload) {
        if (signalsBlocked())
            return;

        const QString key = QString::fromStdString(signalName);
        const auto list = callbacks.values();

        for (const auto &connection : list) {
            if (connection.signalName == key && !connection.callback.isUndefined() && !connection.callback.isNull()) {
                connection.callback(payload);
            }
        }
    }

protected:
    struct JsConnection {
        int id = 0;
        QString signalName;
        val callback = val::undefined();
    };

    int nextConnectionId = 1;
    QHash<int, JsConnection> callbacks;
};

class JsTimer : public JsQObject {
    Q_OBJECT

public:
    explicit JsTimer(QObject *parent = nullptr) : JsQObject(parent) {
        timer.setTimerType(Qt::PreciseTimer);

        connect(&timer, &QTimer::timeout, this, [this]() {
            emitSignal("timeout");
        });
    }

    void setInterval(int ms) {
        timer.setInterval(ms);
    }

    int interval() const {
        return timer.interval();
    }

    void setSingleShot(bool value) {
        timer.setSingleShot(value);
    }

    bool isSingleShot() const {
        return timer.isSingleShot();
    }

    void start() {
        timer.start();
        emitSignal("started");
    }

    void startWithInterval(int ms) {
        timer.start(ms);
        emitSignal("started");
    }

    void stop() {
        timer.stop();
        emitSignal("stopped");
    }

    bool isActive() const {
        return timer.isActive();
    }

private:
    QTimer timer;
};

class JsBehavior : public JsQObject {
    Q_OBJECT

public:
    explicit JsBehavior(QObject *parent = nullptr) : JsQObject(parent) {
        animation = new QPropertyAnimation(this);
        animation->setDuration(250);

        connect(animation, &QPropertyAnimation::stateChanged, this,
                [this](QAbstractAnimation::State newState, QAbstractAnimation::State) {
                    if (!blockRunningChanged) {
                        emitSignalWithPayload("runningChanged", val(newState == QAbstractAnimation::Running));
                    }
                });

        connect(animation, &QPropertyAnimation::finished, this, [this]() {
            writeBypass(targetValue);
            emitSignal("finished");
        });
    }

    ~JsBehavior() override = default;

    void setTarget(JsQObject *target) {
        targetObject = target;
        configureAnimationTarget();
        emitSignal("targetPropertyChanged");
    }

    void setTargetNode(QDomNode *target) {
        targetObject = target;
        configureAnimationTarget();
        emitSignal("targetPropertyChanged");
    }

    void setPropertyName(const std::string &name) {
        propertyName = QByteArray(name.c_str());
        configureAnimationTarget();
        emitSignal("targetPropertyChanged");
    }

    std::string propertyNameJs() const {
        return std::string(propertyName.constData());
    }

    void setDuration(int ms) {
        animation->setDuration(qMax(0, ms));
    }

    int duration() const {
        return animation->duration();
    }

    void setEasing(int easingType) {
        animation->setEasingCurve(static_cast<QEasingCurve::Type>(easingType));
    }

    void setEnabled(bool value) {
        if (enabled == value)
            return;
        enabled = value;
        emitSignal("enabledChanged");
    }

    bool isEnabled() const {
        return enabled;
    }

    void componentFinalized() {
        finalized = true;
    }

    bool isFinalized() const {
        return finalized;
    }

    bool isRunning() const {
        return animation->state() == QAbstractAnimation::Running;
    }

    std::string targetValueJson() const {
        return variantToJson(targetValue);
    }

    std::string currentValueJson() const {
        if (!targetObject || propertyName.isEmpty()) {
            return "null";
        }
        return variantToJson(targetObject->property(propertyName.constData()));
    }

    void write(val value) {
        QVariant nextValue;
        if (value.isUndefined()) {
            nextValue = QVariant();
        } else {
            const std::string json = val::global("JSON").call<std::string>("stringify", value);
            nextValue = jsonToVariant(json);
        }
        writeVariant(nextValue);
    }

    void writeNumber(double value) {
        writeVariant(value);
    }

    void writeString(const std::string &value) {
        writeVariant(QString::fromStdString(value));
    }

    void stop() {
        ++writeGeneration;
        animation->stop();
    }

private:
    void configureAnimationTarget() {
        if (!targetObject || propertyName.isEmpty())
            return;
        animation->setTargetObject(targetObject);
        animation->setPropertyName(propertyName);
    }

    void writeBypass(const QVariant &value) {
        if (!targetObject || propertyName.isEmpty())
            return;
        targetObject->setProperty(propertyName.constData(), value);
        const std::string signalName = std::string(propertyName.constData()) + "Changed";
        emitSignalWithPayload(signalName, val::global("JSON").call<val>("parse", variantToJson(value)));
    }

    void writeVariant(const QVariant &value) {
        const bool changed = targetValue != value;
        if (changed) {
            targetValue = value;
            emitSignalWithPayload("targetValueChanged", val::global("JSON").call<val>("parse", variantToJson(targetValue)));
        }

        const bool bypass = !enabled || !finalized || !targetObject || propertyName.isEmpty();
        if (bypass) {
            if (animation->state() != QAbstractAnimation::Stopped)
                animation->stop();
            writeBypass(value);
            return;
        }

        const bool wasRunning = animation->state() == QAbstractAnimation::Running;
        if (wasRunning && !changed)
            return;

        blockRunningChanged = true;
        if (animation->state() != QAbstractAnimation::Stopped)
            animation->stop();
        blockRunningChanged = false;

        const QVariant currentValue = targetObject->property(propertyName.constData());
        if (!wasRunning && currentValue == targetValue) {
            writeBypass(value);
            return;
        }

        bool fromOk = false;
        bool toOk = false;
        const double fromNumber = currentValue.toDouble(&fromOk);
        const double toNumber = targetValue.toDouble(&toOk);
        if (!fromOk || !toOk || animation->duration() <= 0) {
            const int generation = ++writeGeneration;
            QTimer::singleShot(animation->duration(), this, [this, generation]() {
                if (generation != writeGeneration)
                    return;
                writeBypass(targetValue);
                emitSignal("finished");
            });
            return;
        }

        configureAnimationTarget();
        animation->setStartValue(fromNumber);
        animation->setEndValue(toNumber);
        animation->start();
    }

    QObject *targetObject = nullptr;
    QByteArray propertyName;
    QVariant targetValue;
    QPropertyAnimation *animation = nullptr;
    bool enabled = true;
    bool finalized = false;
    bool blockRunningChanged = false;
    int writeGeneration = 0;
};

class JsPropertyAnimation : public JsQObject {
    Q_OBJECT

public:
    explicit JsPropertyAnimation(QObject *parent = nullptr) : JsQObject(parent) {
        propertyAnimation = new QPropertyAnimation(this);
        animation = propertyAnimation;

        connect(propertyAnimation, &QPropertyAnimation::valueChanged, this, [this](const QVariant &value) {
            QObject *target = propertyAnimation->targetObject();
            if (!target)
                return;

            const QByteArray prop = propertyAnimation->propertyName();
            const std::string signalName = std::string(prop.constData()) + "Changed";

            if (auto *jsTarget = qobject_cast<JsQObject *>(target)) {
                jsTarget->emitSignalWithPayload(signalName, variantToVal(value));
            } else if (auto *targetNode = qobject_cast<QDomNode *>(target)) {
                targetNode->dispatchPropertyChangedJs(std::string(prop.constData()), variantToVal(value), val::undefined());
            }
        });

        connectAnimationSignals(propertyAnimation);
    }

    void setTarget(JsQObject *target) {
        qdomTarget = nullptr;
        animation = propertyAnimation;
        propertyAnimation->setTargetObject(target);
    }

    void setTargetNode(QDomNode *target) {
        qdomTarget = target;
        animation = propertyAnimation;
        propertyAnimation->setTargetObject(target);
    }

    void setPropertyName(const std::string &name) {
        targetProperty = QByteArray(name.c_str());
        propertyAnimation->setPropertyName(targetProperty);
    }

    void setDuration(int ms) {
        propertyAnimation->setDuration(ms);
    }

    void setStartNumber(double value) {
        if (qdomTarget && !targetProperty.isEmpty() && !qdomTarget->property(targetProperty.constData()).isValid()) {
            qdomTarget->setNumberProperty(targetProperty.constData(), value);
        }
        propertyAnimation->setStartValue(value);
    }

    void setEndNumber(double value) {
        propertyAnimation->setEndValue(value);
    }

    void setStartString(const std::string &value) {
        if (qdomTarget && !targetProperty.isEmpty() && !qdomTarget->property(targetProperty.constData()).isValid()) {
            qdomTarget->setStringProperty(targetProperty.constData(), value);
        }
        propertyAnimation->setStartValue(QString::fromStdString(value));
    }

    void setEndString(const std::string &value) {
        propertyAnimation->setEndValue(QString::fromStdString(value));
    }

    void setEasing(int easingType) {
        propertyAnimation->setEasingCurve(static_cast<QEasingCurve::Type>(easingType));
    }

    void start() {
        animation->start();
        emitSignal("started");
    }

    void stop() {
        animation->stop();
        emitSignal("stopped");
    }

    void pause() {
        animation->pause();
        emitSignal("paused");
    }

    void resume() {
        animation->resume();
        emitSignal("resumed");
    }

    QAbstractAnimation *abstractAnimation() const {
        return animation;
    }

private:
    val variantToVal(const QVariant &value) const {
        return val::global("JSON").call<val>("parse", variantToJson(value));
    }

    void connectAnimationSignals(QAbstractAnimation *targetAnimation) {
        if (!targetAnimation) {
            return;
        }
        connect(targetAnimation, &QAbstractAnimation::finished, this, [this]() {
            emitSignal("finished");
        });

        connect(targetAnimation, &QAbstractAnimation::stateChanged, this,
                [this](QAbstractAnimation::State, QAbstractAnimation::State) {
                    emitSignal("stateChanged");
                });
    }

    QAbstractAnimation *animation = nullptr;
    QPropertyAnimation *propertyAnimation = nullptr;
    QDomNode *qdomTarget = nullptr;
    QByteArray targetProperty;
};

class JsScriptActionAnimation : public JsQObject {
    Q_OBJECT

public:
    class ActionAnimation : public QAbstractAnimation {
    public:
        explicit ActionAnimation(JsScriptActionAnimation *owner)
            : QAbstractAnimation(owner), m_owner(owner) {}

        int duration() const override {
            return m_duration;
        }

        void setDuration(int value) {
            m_duration = qMax(0, value);
        }

    protected:
        void updateCurrentTime(int) override {
            if (!m_invoked && m_owner) {
                m_invoked = true;
                m_owner->invoke();
            }
        }

        void updateState(State newState, State oldState) override {
            QAbstractAnimation::updateState(newState, oldState);
            if (newState == Stopped) {
                m_invoked = false;
            }
        }

    private:
        JsScriptActionAnimation *m_owner = nullptr;
        int m_duration = 0;
        bool m_invoked = false;
    };

    explicit JsScriptActionAnimation(QObject *parent = nullptr) : JsQObject(parent) {
        animation = new ActionAnimation(this);
        connect(animation, &QAbstractAnimation::finished, this, [this]() {
            emitSignal("finished");
        });
        connect(animation, &QAbstractAnimation::stateChanged, this,
                [this](QAbstractAnimation::State, QAbstractAnimation::State) {
                    emitSignal("stateChanged");
                });
    }

    void setCallback(val callback) {
        actionCallback = callback;
    }

    void setDuration(int ms) {
        animation->setDuration(ms);
    }

    int duration() const {
        return animation->duration();
    }

    void start() {
        animation->start();
        emitSignal("started");
    }

    void stop() {
        animation->stop();
        emitSignal("stopped");
    }

    void invoke() {
        emitSignal("started");
        if (!actionCallback.isUndefined() && !actionCallback.isNull()) {
            actionCallback();
        }
    }

    QAbstractAnimation *abstractAnimation() const {
        return animation;
    }

private:
    ActionAnimation *animation = nullptr;
    val actionCallback = val::undefined();
};

class JsAnimationGroup : public JsQObject {
    Q_OBJECT

public:
    explicit JsAnimationGroup(QAnimationGroup *animationGroup, QObject *parent = nullptr)
        : JsQObject(parent), group(animationGroup) {
        group->setParent(this);
        connect(group, &QAbstractAnimation::finished, this, [this]() {
            emitSignal("finished");
        });
        connect(group, &QAbstractAnimation::stateChanged, this,
                [this](QAbstractAnimation::State, QAbstractAnimation::State) {
                    emitSignal("stateChanged");
                });
    }

    void addPropertyAnimation(JsPropertyAnimation *animation) {
        addAbstractAnimation(animation ? animation->abstractAnimation() : nullptr);
    }

    void addScriptAction(JsScriptActionAnimation *animation) {
        addAbstractAnimation(animation ? animation->abstractAnimation() : nullptr);
    }

    void addAnimationGroup(JsAnimationGroup *animation) {
        addAbstractAnimation(animation ? animation->abstractAnimation() : nullptr);
    }

    void start() {
        group->start();
        emitSignal("started");
    }

    void stop() {
        group->stop();
        emitSignal("stopped");
    }

    void pause() {
        group->pause();
        emitSignal("paused");
    }

    void resume() {
        group->resume();
        emitSignal("resumed");
    }

    int animationCount() const {
        return group->animationCount();
    }

    int duration() const {
        return group->duration();
    }

    int state() const {
        return static_cast<int>(group->state());
    }

    QAbstractAnimation *abstractAnimation() const {
        return group;
    }

protected:
    void addAbstractAnimation(QAbstractAnimation *animation) {
        if (!animation) {
            return;
        }
        group->addAnimation(animation);
    }

private:
    QAnimationGroup *group = nullptr;
};

class JsSequentialAnimationGroup : public JsAnimationGroup {
    Q_OBJECT

public:
    explicit JsSequentialAnimationGroup(QObject *parent = nullptr)
        : JsAnimationGroup(new QSequentialAnimationGroup, parent) {}
};

class JsParallelAnimationGroup : public JsAnimationGroup {
    Q_OBJECT

public:
    explicit JsParallelAnimationGroup(QObject *parent = nullptr)
        : JsAnimationGroup(new QParallelAnimationGroup, parent) {}
};

class JsQHtmlParser {
public:
    JsQHtmlParser() = default;

    std::string toASTJson(const std::string &source) const {
        return parser.toASTJson(QString::fromStdString(source)).toStdString();
    }

    val toAST(const std::string &source) const {
        const std::string json = toASTJson(source);
        return val::global("JSON").call<val>("parse", json);
    }

    std::string createParserUuid() const {
        return QHtmlParser::createParserUuid().toStdString();
    }

    std::string normalizeWasmMode(const std::string &value) const {
        return QHtmlParser::normalizeWasmMode(QString::fromStdString(value)).toStdString();
    }

private:
    QHtmlParser parser;
};


EMSCRIPTEN_BINDINGS(qhtml_qt_core) {
    class_<JsQObject>("QObject")
    .constructor<>()
        .function("setObjectName", &JsQObject::setObjectNameJs)
        .function("objectName", &JsQObject::objectNameJs)
        .function("parent", &JsQObject::parentJs, emscripten::allow_raw_pointers())
        .function("setParent", &JsQObject::setParentJs, emscripten::allow_raw_pointers())
        .function("childAt", &JsQObject::childAt, emscripten::allow_raw_pointers())
        .function("childCount", &JsQObject::childCount)
        .function("children", &JsQObject::childrenJson)
        .function("setString", &JsQObject::setString)
        .function("setNumber", &JsQObject::setNumber)
        .function("setBool", &JsQObject::setBool)
        .function("getString", &JsQObject::getString)
        .function("getNumber", &JsQObject::getNumber)
        .function("getBool", &JsQObject::getBool)
        .function("blockSignals", &JsQObject::blockSignalsJs)
        .function("signalsBlocked", &JsQObject::signalsBlockedJs)
        .function("setPropertyValue", &JsQObject::setPropertyValue)
        .function("propertyValue", &JsQObject::propertyValue)
        .function("propertyJson", &JsQObject::propertyJson)
        .function("propertyKeys", &JsQObject::propertyKeys)
        .function("connect", &JsQObject::connectJs)
        .function("disconnect", &JsQObject::disconnectJs)
        .function("emit", &JsQObject::emitSignalWithPayload)
        .function("emitSignal", &JsQObject::emitSignal);

    class_<JsTimer, emscripten::base<JsQObject>>("QTimer")
        .constructor<>()
        .function("setInterval", &JsTimer::setInterval)
        .function("interval", &JsTimer::interval)
        .function("setSingleShot", &JsTimer::setSingleShot)
        .function("isSingleShot", &JsTimer::isSingleShot)
        .function("start", &JsTimer::start)
        .function("startWithInterval", &JsTimer::startWithInterval)
        .function("stop", &JsTimer::stop)
        .function("isActive", &JsTimer::isActive);

    class_<JsBehavior, emscripten::base<JsQObject>>("QBehavior")
        .constructor<>()
        .function("setTarget", &JsBehavior::setTarget, emscripten::allow_raw_pointers())
        .function("setTargetNode", &JsBehavior::setTargetNode, emscripten::allow_raw_pointers())
        .function("setPropertyName", &JsBehavior::setPropertyName)
        .function("propertyName", &JsBehavior::propertyNameJs)
        .function("setDuration", &JsBehavior::setDuration)
        .function("duration", &JsBehavior::duration)
        .function("setEasing", &JsBehavior::setEasing)
        .function("setEnabled", &JsBehavior::setEnabled)
        .function("isEnabled", &JsBehavior::isEnabled)
        .function("componentFinalized", &JsBehavior::componentFinalized)
        .function("isFinalized", &JsBehavior::isFinalized)
        .function("isRunning", &JsBehavior::isRunning)
        .function("targetValueJson", &JsBehavior::targetValueJson)
        .function("currentValueJson", &JsBehavior::currentValueJson)
        .function("write", &JsBehavior::write)
        .function("writeNumber", &JsBehavior::writeNumber)
        .function("writeString", &JsBehavior::writeString)
        .function("stop", &JsBehavior::stop);

    class_<JsPropertyAnimation, emscripten::base<JsQObject>>("QPropertyAnimation")
        .constructor<>()
        .function("setTarget", &JsPropertyAnimation::setTarget, emscripten::allow_raw_pointers())
        .function("setTargetNode", &JsPropertyAnimation::setTargetNode, emscripten::allow_raw_pointers())
        .function("setPropertyName", &JsPropertyAnimation::setPropertyName)
        .function("setDuration", &JsPropertyAnimation::setDuration)
        .function("setStartNumber", &JsPropertyAnimation::setStartNumber)
        .function("setEndNumber", &JsPropertyAnimation::setEndNumber)
        .function("setStartString", &JsPropertyAnimation::setStartString)
        .function("setEndString", &JsPropertyAnimation::setEndString)
        .function("setEasing", &JsPropertyAnimation::setEasing)
        .function("start", &JsPropertyAnimation::start)
        .function("stop", &JsPropertyAnimation::stop)
        .function("pause", &JsPropertyAnimation::pause)
        .function("resume", &JsPropertyAnimation::resume);

    class_<JsScriptActionAnimation, emscripten::base<JsQObject>>("QScriptActionAnimation")
        .constructor<>()
        .function("setCallback", &JsScriptActionAnimation::setCallback)
        .function("setDuration", &JsScriptActionAnimation::setDuration)
        .function("duration", &JsScriptActionAnimation::duration)
        .function("start", &JsScriptActionAnimation::start)
        .function("stop", &JsScriptActionAnimation::stop);

    class_<JsAnimationGroup, emscripten::base<JsQObject>>("QAnimationGroup")
        .function("addPropertyAnimation", &JsAnimationGroup::addPropertyAnimation, emscripten::allow_raw_pointers())
        .function("addScriptAction", &JsAnimationGroup::addScriptAction, emscripten::allow_raw_pointers())
        .function("addAnimationGroup", &JsAnimationGroup::addAnimationGroup, emscripten::allow_raw_pointers())
        .function("start", &JsAnimationGroup::start)
        .function("stop", &JsAnimationGroup::stop)
        .function("pause", &JsAnimationGroup::pause)
        .function("resume", &JsAnimationGroup::resume)
        .function("animationCount", &JsAnimationGroup::animationCount)
        .function("duration", &JsAnimationGroup::duration)
        .function("state", &JsAnimationGroup::state);

    class_<JsSequentialAnimationGroup, emscripten::base<JsAnimationGroup>>("QSequentialAnimationGroup")
        .constructor<>();

    class_<JsParallelAnimationGroup, emscripten::base<JsAnimationGroup>>("QParallelAnimationGroup")
        .constructor<>();

    class_<JsQHtmlParser>("QHtmlParser")
        .constructor<>()
        .function("toAST", &JsQHtmlParser::toAST)
        .function("toASTJson", &JsQHtmlParser::toASTJson)
        .function("createParserUuid", &JsQHtmlParser::createParserUuid)
        .function("normalizeWasmMode", &JsQHtmlParser::normalizeWasmMode);

}

int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    return app.exec();
}

#include "main.moc"
