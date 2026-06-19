// qhtml_parser.cpp
// Implementation of a subset of qhtml-parser functionality for C++/Qt.
// See qhtml_parser.h for API documentation.

#include "qhtml_parser.h"

#include <cctype>
#include <algorithm>
#include <regex>
#include <QRegularExpression>>
#ifdef QT_CORE_LIB
#include <QUuid>
#endif

// Helper: lower‑case copy of a QString
static QString toLowerTrim(const QString &input)
{
    QString s = input.trimmed();
    // Convert to lower case one character at a time to avoid
    // locale‑dependent behaviour.
    for (auto &ch : s) {
        ch = ch.toLower();
    }
    return s;
}

QString QHtmlParser::createParserUuid()
{
#ifdef QT_CORE_LIB
    // QUuid::createUuid generates an RFC4122 v4 identifier.  We
    // convert it to the canonical string representation.
    QUuid uuid = QUuid::createUuid();
    return uuid.toString(QUuid::WithoutBraces);
#else
    // Fallback: generate a pseudo‑random UUID v4 using std::random.
    // This is not cryptographically secure but suffices for most
    // non‑cryptographic use cases.
    static std::random_device rd;
    static std::mt19937_64 gen(rd());
    std::uniform_int_distribution<uint64_t> dist;
    auto rand64 = [&]() { return dist(gen); };
    uint64_t a = rand64();
    uint64_t b = rand64();
    // Set version (4) and variant (10xx)
    a &= 0xffffffffffff0fffULL;
    a |= 0x0000000000004000ULL;
    b &= 0x3fffffffffffffffULL;
    b |= 0x8000000000000000ULL;
    char buf[37];
    snprintf(buf, sizeof(buf),
             "%08x-%04x-%04x-%04x-%012llx",
             (unsigned int)(a >> 32), (unsigned int)((a >> 16) & 0xffff),
             (unsigned int)(a & 0xffff), (unsigned int)(b >> 48),
             (unsigned long long)(b & 0xffffffffffffULL));
    return QString::fromLatin1(buf);
#endif
}

QString QHtmlParser::normalizeWasmMode(const QString &value)
{
    const QString mode = toLowerTrim(value);
    if (mode == QLatin1String("main") ||
        mode == QLatin1String("main-thread") ||
        mode == QLatin1String("mainthread")) {
        return QStringLiteral("main");
    }
    if (mode == QLatin1String("worker") ||
        mode == QLatin1String("worker-thread") ||
        mode == QLatin1String("workerthread")) {
        return QStringLiteral("worker");
    }
    return QString();
}

std::optional<bool> QHtmlParser::parseWasmBoolean(const QString &value)
{
    const QString v = toLowerTrim(value);
    if (v.isEmpty()) {
        return std::nullopt;
    }
    if (v == QLatin1String("true") || v == QLatin1String("1") ||
        v == QLatin1String("yes") || v == QLatin1String("on")) {
        return true;
    }
    if (v == QLatin1String("false") || v == QLatin1String("0") ||
        v == QLatin1String("no") || v == QLatin1String("off")) {
        return false;
    }
    return std::nullopt;
}

std::optional<int> QHtmlParser::parseWasmPositiveInteger(const QString &value)
{
    QString trimmed = value.trimmed();
    if (trimmed.isEmpty()) {
        return std::nullopt;
    }
    // Reject negative numbers
    bool ok = false;
    // The toLongLong conversion stops at the first non‑numeric char.
    // Use base 10 and catch conversion failures.
    long long n = trimmed.toLongLong(&ok, 10);
    if (!ok || n < 0) {
        return std::nullopt;
    }
    // Ensure the value fits into a 32‑bit int if needed.
    if (n > std::numeric_limits<int>::max()) {
        return std::nullopt;
    }
    return static_cast<int>(n);
}

QList<QVariant> QHtmlParser::parseQWasmBindingRules(const QString &rawBody)
{
    QList<QVariant> out;
    // Use a set to de‑duplicate entries based on exportName + targetType + targetName
    QSet<QString> seen;
    // Split on commas; also handle newlines and semicolons as separators.
    QStringList entries = rawBody.split(QRegularExpression("[,\n;]"), Qt::SkipEmptyParts);
    QRegularExpression re("^\s*([A-Za-z_][A-Za-z0-9_]*)\s*->\s*(method|signal)\s*([A-Za-z_][A-Za-z0-9_]*)\s*$");
    for (const QString &entry : entries) {
        QString trimmed = entry.trimmed();
        if (trimmed.isEmpty()) {
            continue;
        }
        QRegularExpressionMatch match = re.match(trimmed);
        if (!match.hasMatch()) {
            continue;
        }
        QString exportName = match.captured(1);
        QString targetType = match.captured(2);
        QString targetName = match.captured(3);
        QString key = exportName.toLower() + QStringLiteral("::") + targetType.toLower() + QStringLiteral("::") + targetName.toLower();
        if (seen.contains(key)) {
            continue;
        }
        seen.insert(key);
        QMap<QString, QVariant> item;
        item.insert(QStringLiteral("exportName"), exportName);
        item.insert(QStringLiteral("targetType"), targetType);
        item.insert(QStringLiteral("targetName"), targetName);
        out.append(QVariant(item));
    }
    return out;
}

QMap<QString, QVariant> QHtmlParser::parseQWasmConfig(const QString &rawBody)
{
    QMap<QString, QVariant> result;
    // Initialise empty containers for lists
    QStringList exportsList;
    QStringList allowList;
    QList<QVariant> bindList;
    // Copy the input so we can strip recognised blocks from it
    QString remaining = rawBody;
    // Parse block entries (exports, allowImports, bind)
    struct BlockInfo {
        QString key;
        QString body;
    };
    QList<BlockInfo> blocks;
    // Regular expression to match keyword { body }
    QRegularExpression blockRe("\b(exports|allowimports|bind)\s*\{([\s\S]*?)\}", QRegularExpression::CaseInsensitiveOption);
    QRegularExpressionMatchIterator it = blockRe.globalMatch(rawBody);
    while (it.hasNext()) {
        QRegularExpressionMatch m = it.next();
        QString key = m.captured(1).toLower();
        QString body = m.captured(2);
        blocks.append({key, body});
        // Remove this block from remaining
        int start = m.capturedStart();
        int end = m.capturedEnd();
        remaining.replace(start, end - start, QString());
    }
    // Process blocks
    for (const BlockInfo &blk : blocks) {
        if (blk.key == QLatin1String("exports")) {
            // Extract identifiers from the body
            QRegularExpression identRe("[A-Za-z_][A-Za-z0-9_]*");
            QRegularExpressionMatchIterator mi = identRe.globalMatch(blk.body);
            while (mi.hasNext()) {
                QRegularExpressionMatch mm = mi.next();
                QString name = mm.captured(0);
                if (!exportsList.contains(name, Qt::CaseInsensitive)) {
                    exportsList.append(name);
                }
            }
        } else if (blk.key == QLatin1String("allowimports")) {
            QRegularExpression identRe("[A-Za-z_][A-Za-z0-9_]*");
            QRegularExpressionMatchIterator mi = identRe.globalMatch(blk.body);
            while (mi.hasNext()) {
                QRegularExpressionMatch mm = mi.next();
                QString name = mm.captured(0);
                if (!allowList.contains(name, Qt::CaseInsensitive)) {
                    allowList.append(name);
                }
            }
        } else if (blk.key == QLatin1String("bind")) {
            bindList = parseQWasmBindingRules(blk.body);
        }
    }
    // Parse key:value pairs from the remaining text
    QRegularExpression kvRe("\b(src|mode|awaitwasm|timeoutms|maxpayloadbytes)\s*:\s*([^,;\n\r]+)", QRegularExpression::CaseInsensitiveOption);
    QRegularExpressionMatchIterator kvIt = kvRe.globalMatch(remaining);
    QString src;
    QString mode;
    std::optional<bool> awaitWasm;
    std::optional<int> timeoutMs;
    std::optional<int> maxPayload;
    while (kvIt.hasNext()) {
        QRegularExpressionMatch m = kvIt.next();
        QString key = m.captured(1).toLower();
        QString value = m.captured(2).trimmed();
        if (key == QLatin1String("src")) {
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith('\'') && value.endsWith('\''))) {
                value = value.mid(1, value.length() - 2);
            }
            src = value;
        } else if (key == QLatin1String("mode")) {
            mode = normalizeWasmMode(value);
        } else if (key == QLatin1String("awaitwasm")) {
            awaitWasm = parseWasmBoolean(value);
        } else if (key == QLatin1String("timeoutms")) {
            timeoutMs = parseWasmPositiveInteger(value);
        } else if (key == QLatin1String("maxpayloadbytes")) {
            maxPayload = parseWasmPositiveInteger(value);
        }
    }
    // Build result map
    result.insert(QStringLiteral("src"), src);
    result.insert(QStringLiteral("mode"), mode);
    // Convert optional values to QVariant; invalid QVariant indicates null
    if (awaitWasm.has_value()) {
        result.insert(QStringLiteral("awaitWasm"), QVariant(awaitWasm.value()));
    } else {
        result.insert(QStringLiteral("awaitWasm"), QVariant());
    }
    if (timeoutMs.has_value()) {
        result.insert(QStringLiteral("timeoutMs"), QVariant(timeoutMs.value()));
    } else {
        result.insert(QStringLiteral("timeoutMs"), QVariant());
    }
    if (maxPayload.has_value()) {
        result.insert(QStringLiteral("maxPayloadBytes"), QVariant(maxPayload.value()));
    } else {
        result.insert(QStringLiteral("maxPayloadBytes"), QVariant());
    }
    result.insert(QStringLiteral("exports"), QVariant(exportsList));
    result.insert(QStringLiteral("allowImports"), QVariant(allowList));
    result.insert(QStringLiteral("bind"), QVariant::fromValue(bindList));
    return result;
}
