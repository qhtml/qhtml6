cmake_minimum_required(VERSION 3.19)
project(qhtml-qt LANGUAGES CXX)

find_package(Qt6 6.11.1 REQUIRED COMPONENTS Core )

qt_standard_project_setup()

qt_add_executable(qhtml-qt
    main.cpp
    qdom_components.hpp
    qdom_parser.hpp
    qdom_resource_importer.cpp
    qdom_resource_importer.hpp
    qdom_variant.hpp
    qhtml_resources.qrc
)

target_link_libraries(qhtml-qt
    PRIVATE
        Qt::Core
)

if(EMSCRIPTEN)
    target_link_options(qhtml-qt PRIVATE
        "--bind"
        "-sEXPORTED_FUNCTIONS=['_main']"
        "-sFETCH=1"
        "-sFILESYSTEM=1"
        "-sASSERTIONS=0"
        "-sDEMANGLE_SUPPORT=0"
    )
endif()
install(TARGETS qhtml-qt
    BUNDLE  DESTINATION .
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)
