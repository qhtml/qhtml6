#include <QCoreApplication>
#include <QObject>
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

class JsPropertyAnimation : public JsQObject {
    Q_OBJECT

public:
    explicit JsPropertyAnimation(QObject *parent = nullptr) : JsQObject(parent) {
        animation = new QPropertyAnimation(this);

        connect(animation, &QPropertyAnimation::valueChanged, this, [this](const QVariant &) {
            QObject *target = animation->targetObject();
            if (!target)
                return;

            auto *jsTarget = qobject_cast<JsQObject *>(target);
            if (!jsTarget)
                return;

            const QByteArray prop = animation->propertyName();
            const std::string signalName = std::string(prop.constData()) + "Changed";

            jsTarget->emitSignal(signalName);
        });

        connect(animation, &QPropertyAnimation::finished, this, [this]() {
            emitSignal("finished");
        });

        connect(animation, &QPropertyAnimation::stateChanged, this,
                [this](QAbstractAnimation::State, QAbstractAnimation::State) {
                    emitSignal("stateChanged");
                }
                );
    }

    void setTarget(JsQObject *target) {
        animation->setTargetObject(target);
    }

    void setPropertyName(const std::string &name) {
        animation->setPropertyName(QByteArray(name.c_str()));
    }

    void setDuration(int ms) {
        animation->setDuration(ms);
    }

    void setStartNumber(double value) {
        animation->setStartValue(value);
    }

    void setEndNumber(double value) {
        animation->setEndValue(value);
    }

    void setStartString(const std::string &value) {
        animation->setStartValue(QString::fromStdString(value));
    }

    void setEndString(const std::string &value) {
        animation->setEndValue(QString::fromStdString(value));
    }

    void setEasing(int easingType) {
        animation->setEasingCurve(static_cast<QEasingCurve::Type>(easingType));
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

private:
    QPropertyAnimation *animation = nullptr;
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

    class_<JsPropertyAnimation, emscripten::base<JsQObject>>("QPropertyAnimation")
        .constructor<>()
        .function("setTarget", &JsPropertyAnimation::setTarget, emscripten::allow_raw_pointers())
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
