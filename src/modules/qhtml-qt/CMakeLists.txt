cmake_minimum_required(VERSION 3.19)
project(qhtml-qt LANGUAGES CXX)

find_package(Qt6 6.11.1 REQUIRED COMPONENTS Core  )

qt_standard_project_setup()

qt_add_executable(qhtml-qt
    main.cpp
    qhtml_parser.cpp qhtml_parser.h
    qhtml_qdom.cpp qhtml_qdom.h
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
