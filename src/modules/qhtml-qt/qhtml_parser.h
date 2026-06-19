// qhtml_parser.h
// This header provides a starting point for a C++ port of selected
// functionality from the original qhtml-parser JavaScript module.
//
// The intent of this file is to expose a few utility routines that can be
// compiled into a Qt‑wasm project (Qt 6.11.1) and used in place of the
// equivalent JavaScript helpers.  Only a subset of the parser has been
// implemented here; additional functionality can be layered in as
// necessary.
//
// See qhtml-parser(2).js for the original implementation details.  All
// functions here aim to behave similarly to their JavaScript counterparts
// but are written in idiomatic C++ using Qt types where appropriate.

#ifndef QHTML_PARSER_H
#define QHTML_PARSER_H

#include <QString>
#include <QStringList>
#include <QMap>
#include <QList>
#include <QVariant>
#include <optional>

/// \brief A collection of static helper functions for parsing q-wasm
/// configuration blocks and generating UUIDs.  These functions mirror
/// selected behaviour from the qhtml-parser JavaScript implementation.
class QHtmlParser
{
public:
    /// \brief Generates a random UUID string.
    ///
    /// The JavaScript version uses the Web Crypto API to generate
    /// RFC4122 v4 identifiers.  Here we rely on Qt's QUuid class to
    /// produce a similar identifier.  If QUuid is unavailable when
    /// compiling for WebAssembly, a fallback based on the current
    /// timestamp and random numbers is used.
    static QString createParserUuid();

    /// \brief Normalise a q-wasm mode string.
    ///
    /// Accepts several synonymous spellings (e.g. "main-thread" and
    /// "mainThread").  Returns either "main", "worker" or an empty
    /// string if the mode is not recognised.
    static QString normalizeWasmMode(const QString &value);

    /// \brief Parse a boolean value from a textual representation.
    ///
    /// Recognises "true", "1", "yes", "on" as true and "false",
    /// "0", "no", "off" as false (case‑insensitive).  Returns
    /// std::nullopt if the value cannot be interpreted as a boolean.
    static std::optional<bool> parseWasmBoolean(const QString &value);

    /// \brief Parse a positive integer from a string.
    ///
    /// Returns an optional containing the integer value if the string
    /// contains a non‑negative integral value.  If the string does not
    /// represent a finite number or is negative, std::nullopt is
    /// returned.
    static std::optional<int> parseWasmPositiveInteger(const QString &value);

    /// \brief Parse q-wasm binding rules from a block of text.
    ///
    /// A binding rule block contains comma‑separated entries in the
    /// format "exportName -> method targetName" or "exportName ->
    /// signal targetName".  The returned QVariantList contains a
    /// sequence of QMap objects with keys "exportName", "targetType"
    /// and "targetName".
    static QList<QVariant> parseQWasmBindingRules(const QString &rawBody);

    /// \brief Parse a q-wasm configuration from a block of text.
    ///
    /// The configuration may include simple key:value assignments and
    /// nested blocks for exports, allowImports and bind sections.
    /// This function parses a minimal subset of the configuration
    /// language.  Unknown keys are ignored.  The returned QMap
    /// contains the following keys:
    ///   - src : QString
    ///   - mode : QString
    ///   - awaitWasm : std::optional<bool>
    ///   - timeoutMs : std::optional<int>
    ///   - maxPayloadBytes : std::optional<int>
    ///   - exports : QStringList
    ///   - allowImports : QStringList
    ///   - bind : QList<QVariant> (see parseQWasmBindingRules)
    static QMap<QString, QVariant> parseQWasmConfig(const QString &rawBody);
};

#endif // QHTML_PARSER_H