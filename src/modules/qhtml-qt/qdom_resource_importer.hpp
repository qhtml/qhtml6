#pragma once

#include "qdom_parser.hpp"

#include <QtCore/QDir>
#include <QtCore/QFile>
#include <QtCore/QRegularExpression>
#include <QtCore/QSet>
#include <QtCore/QString>
#include <QtCore/QStringList>
#include <QtCore/QTextStream>

#include <string>

namespace qhtml::wasm {

class QDomResourceImporter {
public:
    QDomResourceImporter() = default;

    [[nodiscard]] QString normalizePath(QString path) const
    {
        path = firstImportToken(path.trimmed());
        if ((path.startsWith(QLatin1Char('"')) && path.endsWith(QLatin1Char('"'))) ||
            (path.startsWith(QLatin1Char('\'')) && path.endsWith(QLatin1Char('\'')))) {
            path = path.mid(1, path.size() - 2);
        }

        path = path.trimmed();
        if (path.startsWith(QStringLiteral("qrc:///qhtml/"))) {
            path = path.mid(QStringLiteral("qrc:///qhtml/").size());
        } else if (path.startsWith(QStringLiteral("qrc:/qhtml/"))) {
            path = path.mid(QStringLiteral("qrc:/qhtml/").size());
        } else if (path.startsWith(QStringLiteral(":/qhtml/"))) {
            path = path.mid(QStringLiteral(":/qhtml/").size());
        } else if (path.startsWith(QStringLiteral("/qhtml/"))) {
            path = path.mid(QStringLiteral("/qhtml/").size());
        }

        while (path.startsWith(QStringLiteral("./"))) {
            path = path.mid(2);
        }
        if (path.startsWith(QLatin1Char('/'))) {
            path = path.mid(1);
        }
        if (path.startsWith(QStringLiteral("dist/"))) {
            path = path.mid(QStringLiteral("dist/").size());
        }

        return path;
    }

    [[nodiscard]] std::string normalizePathJs(const std::string &path) const
    {
        return stdStringFromQString(normalizePath(qStringFromStdString(path)));
    }

    [[nodiscard]] bool exists(const QString &path) const
    {
        return QFile::exists(resourceUrl(normalizePath(path))) ||
            QFile::exists(resourceUrl(qComponentsRelativePath(path)));
    }

    [[nodiscard]] bool existsJs(const std::string &path) const
    {
        return exists(qStringFromStdString(path));
    }

    [[nodiscard]] QString readText(const QString &path) const
    {
        QFile file(resourcePath(path));
        if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
            return {};
        }

        QTextStream stream(&file);
        return stream.readAll();
    }

    [[nodiscard]] std::string readTextJs(const std::string &path) const
    {
        return stdStringFromQString(readText(qStringFromStdString(path)));
    }

    [[nodiscard]] QString expandedSource(const QString &path) const
    {
        QSet<QString> stack;
        return expandedSource(path, stack);
    }

    [[nodiscard]] std::string expandedSourceJs(const std::string &path) const
    {
        return stdStringFromQString(expandedSource(qStringFromStdString(path)));
    }

    [[nodiscard]] QString expandImportsInSource(const QString &source) const
    {
        QSet<QString> stack;
        return expandInlineImports(source, stack);
    }

    [[nodiscard]] std::string expandImportsInSourceJs(const std::string &source) const
    {
        return stdStringFromQString(expandImportsInSource(qStringFromStdString(source)));
    }

    [[nodiscard]] QDomDocument parseResource(const QString &path) const
    {
        QDomParser parser;
        parser.setResourceImportResolver([this](const QString &importPath) {
            return expandedSource(importPath);
        });
        return parser.parse(expandedSource(path));
    }

    [[nodiscard]] QDomDocument parseSource(const QString &source) const
    {
        QDomParser parser;
        parser.setResourceImportResolver([this](const QString &importPath) {
            return expandedSource(importPath);
        });
        return parser.parse(source);
    }

    [[nodiscard]] int parsedResourceNodeCountJs(const std::string &path) const
    {
        return parseResource(qStringFromStdString(path)).nodes.size();
    }

    [[nodiscard]] int parsedSourceNodeCountJs(const std::string &source) const
    {
        return parseSource(qStringFromStdString(source)).nodes.size();
    }

    [[nodiscard]] QStringList resourcePaths() const
    {
        QStringList paths{QStringLiteral("q-components.qhtml")};
        const QDir dir(QStringLiteral(":/qhtml/q-components"));
        for (const QString &name : dir.entryList(QDir::Files, QDir::Name)) {
            paths.append(QStringLiteral("q-components/") + name);
        }
        return paths;
    }

    [[nodiscard]] std::string resourcePathsJs() const
    {
        return stdStringFromQString(resourcePaths().join(QLatin1Char('\n')));
    }

private:
    [[nodiscard]] QString resourcePath(const QString &path) const
    {
        const QString normalized = normalizePath(path);
        if (QFile::exists(resourceUrl(normalized))) {
            return resourceUrl(normalized);
        }
        const QString relative = qComponentsRelativePath(normalized);
        if (QFile::exists(resourceUrl(relative))) {
            return resourceUrl(relative);
        }
        return resourceUrl(normalized);
    }

    [[nodiscard]] QString resourceUrl(const QString &normalizedPath) const
    {
        return QStringLiteral(":/qhtml/") + normalizedPath;
    }

    [[nodiscard]] QString qComponentsRelativePath(const QString &path) const
    {
        const QString normalized = normalizePath(path);
        if (normalized.isEmpty() || normalized.contains(QLatin1Char('/')) ||
            normalized == QStringLiteral("q-components.qhtml")) {
            return normalized;
        }
        return QStringLiteral("q-components/") + normalized;
    }

    [[nodiscard]] QString firstImportToken(QString value) const
    {
        value = value.trimmed();
        if (value.isEmpty()) {
            return {};
        }

        bool inQuote = false;
        QChar quote;
        for (qsizetype i = 0; i < value.size(); ++i) {
            const QChar ch = value.at(i);
            if (inQuote) {
                if (ch == quote && (i == 0 || value.at(i - 1) != QLatin1Char('\\'))) {
                    inQuote = false;
                }
                continue;
            }
            if (ch == QLatin1Char('"') || ch == QLatin1Char('\'')) {
                inQuote = true;
                quote = ch;
                continue;
            }
            if (ch.isSpace()) {
                return value.left(i).trimmed();
            }
        }
        return value;
    }

    [[nodiscard]] QString expandedSource(const QString &path, QSet<QString> &stack) const
    {
        const QString normalized = normalizePath(path);
        if (normalized.isEmpty() || stack.contains(normalized)) {
            return {};
        }

        stack.insert(normalized);
        const QString source = readText(normalized);
        const QString expanded = expandInlineImports(source, stack);
        stack.remove(normalized);
        return expanded;
    }

    [[nodiscard]] QString expandInlineImports(const QString &source, QSet<QString> &stack) const
    {
        static const QRegularExpression importPattern(
            QStringLiteral("\\bq-import(?:-resource)?\\s*\\{([^{}]*)\\}"));

        QString output;
        qsizetype lastEnd = 0;
        const auto matches = importPattern.globalMatch(source);
        auto iterator = matches;
        while (iterator.hasNext()) {
            const QRegularExpressionMatch match = iterator.next();
            output += source.mid(lastEnd, match.capturedStart() - lastEnd);

            const QString importBody = match.captured(1).trimmed();
            QString importPath = normalizePath(importBody);
            if (!exists(importPath)) {
                importPath = qComponentsRelativePath(importPath);
            }
            if (exists(importPath)) {
                output += expandedSource(importPath, stack);
            } else {
                output += match.captured(0);
            }

            lastEnd = match.capturedEnd();
        }

        output += source.mid(lastEnd);
        return output;
    }
};

} // namespace qhtml::wasm
