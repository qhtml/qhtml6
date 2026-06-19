// qhtml_parser.h
// QtCore-only symbolic parser for QHTML source.
//
// This class is intentionally runtime-free: it does not evaluate JavaScript,
// mount components, or build browser DOM.  It parses QHTML into QVariant-based
// AST maps/lists that can be bridged to JavaScript from the wasm module.

#ifndef QHTML_PARSER_H
#define QHTML_PARSER_H

#include <QList>
#include <QMap>
#include <QVariant>
#include <QString>
#include <QStringList>

#include <optional>

class QHtmlParser
{
public:
    QHtmlParser() = default;

    /// Parse QHTML source into a symbolic AST document:
    /// { type: "QHtmlDocument", source: QString, body: QVariantList }.
    QMap<QString, QVariant> toAST(const QString &source) const;

    /// Parse QHTML source and serialize the symbolic AST to compact JSON.
    QString toASTJson(const QString &source) const;

    static QString createParserUuid();
    static QString normalizeWasmMode(const QString &value);
    static std::optional<bool> parseWasmBoolean(const QString &value);
    static std::optional<int> parseWasmPositiveInteger(const QString &value);
    static QList<QVariant> parseQWasmBindingRules(const QString &rawBody);
    static QMap<QString, QVariant> parseQWasmConfig(const QString &rawBody);
};

#endif // QHTML_PARSER_H
