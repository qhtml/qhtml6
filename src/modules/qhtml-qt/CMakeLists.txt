cmake_minimum_required(VERSION 3.19)
project(qhtml-qt LANGUAGES CXX)

find_package(Qt6 6.5 REQUIRED COMPONENTS Core Qml )

qt_standard_project_setup()

qt_add_executable(qhtml-qt
    main.cpp
)

target_link_libraries(qhtml-qt
    PRIVATE
        Qt::Core
        Qt6::Qml
)

if(EMSCRIPTEN)
    target_link_options(qhtml-qt PRIVATE
        "--bind"
        "-sEXPORTED_FUNCTIONS=['_main']"
        "-sSINGLE_FILE=1"
    )
endif()
install(TARGETS qhtml-qt
    BUNDLE  DESTINATION .
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
)
