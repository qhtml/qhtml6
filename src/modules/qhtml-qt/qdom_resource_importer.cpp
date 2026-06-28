#include "qdom_resource_importer.hpp"

#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>

namespace {

std::string qhtmlResourceNormalizePath(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().normalizePathJs(path);
}

bool qhtmlResourceExists(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().existsJs(path);
}

std::string qhtmlReadResource(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().readTextJs(path);
}

std::string qhtmlExpandResource(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().expandedSourceJs(path);
}

std::string qhtmlExpandResourceImportsInSource(const std::string &source)
{
    return qhtml::wasm::QDomResourceImporter().expandImportsInSourceJs(source);
}

int qhtmlParsedResourceNodeCount(const std::string &path)
{
    return qhtml::wasm::QDomResourceImporter().parsedResourceNodeCountJs(path);
}

std::string qhtmlResourcePaths()
{
    return qhtml::wasm::QDomResourceImporter().resourcePathsJs();
}

} // namespace

EMSCRIPTEN_BINDINGS(qhtml_qdom_resource_importer)
{
    emscripten::class_<qhtml::wasm::QDomResourceImporter>("QDomResourceImporter")
        .constructor<>()
        .function("normalizePath", &qhtml::wasm::QDomResourceImporter::normalizePathJs)
        .function("exists", &qhtml::wasm::QDomResourceImporter::existsJs)
        .function("readText", &qhtml::wasm::QDomResourceImporter::readTextJs)
        .function("expandedSource", &qhtml::wasm::QDomResourceImporter::expandedSourceJs)
        .function("expandImportsInSource", &qhtml::wasm::QDomResourceImporter::expandImportsInSourceJs)
        .function("parsedResourceNodeCount", &qhtml::wasm::QDomResourceImporter::parsedResourceNodeCountJs)
        .function("parsedSourceNodeCount", &qhtml::wasm::QDomResourceImporter::parsedSourceNodeCountJs)
        .function("resourcePaths", &qhtml::wasm::QDomResourceImporter::resourcePathsJs);

    emscripten::function("qhtmlResourceNormalizePath", &qhtmlResourceNormalizePath);
    emscripten::function("qhtmlResourceExists", &qhtmlResourceExists);
    emscripten::function("qhtmlReadResource", &qhtmlReadResource);
    emscripten::function("qhtmlExpandResource", &qhtmlExpandResource);
    emscripten::function("qhtmlExpandResourceImportsInSource", &qhtmlExpandResourceImportsInSource);
    emscripten::function("qhtmlParsedResourceNodeCount", &qhtmlParsedResourceNodeCount);
    emscripten::function("qhtmlResourcePaths", &qhtmlResourcePaths);
}
#endif
