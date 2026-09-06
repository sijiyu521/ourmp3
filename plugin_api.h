#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef _WIN32
#  if defined(OURMP3_PLUGIN_BUILD)
#    define OURMP3_PLUGIN_EXPORT __declspec(dllexport)
#  else
#    define OURMP3_PLUGIN_EXPORT __declspec(dllimport)
#  endif
#else
#  define OURMP3_PLUGIN_EXPORT __attribute__((visibility("default")))
#endif

#define OURMP3_PLUGIN_API_VERSION 1u

typedef enum {
    OURMP3_PLUGIN_SERVICE = 0,
    OURMP3_PLUGIN_SOURCE,
    OURMP3_PLUGIN_DECODER,
    OURMP3_PLUGIN_OUTPUT,
    OURMP3_PLUGIN_EFFECT,
    OURMP3_PLUGIN_UI,
    OURMP3_PLUGIN_COMMAND
} OurMp3PluginKind;

typedef struct {
    uint32_t api_version;
    const char *id;
    const char *name;
    const char *version;
    OurMp3PluginKind kind;
} OurMp3PluginInfo;

typedef void (*OurMp3ServiceDestroy)(void *service);
typedef void (*OurMp3EventHandler)(const char *event_name,
                                   const void *payload,
                                   size_t payload_size,
                                   void *user_data);

typedef struct OurMp3HostApi {
    uint32_t api_version;
    void *user_data;

    int (*register_service)(void *user_data,
                            const char *service_id,
                            void *service,
                            OurMp3ServiceDestroy destroy);
    int (*unregister_service)(void *user_data, const char *service_id);
    void *(*get_service)(void *user_data, const char *service_id);

    int (*subscribe)(void *user_data,
                     const char *event_name,
                     OurMp3EventHandler handler,
                     void *handler_user_data);
    int (*unsubscribe)(void *user_data,
                       const char *event_name,
                       OurMp3EventHandler handler,
                       void *handler_user_data);
    int (*emit)(void *user_data,
                const char *event_name,
                const void *payload,
                size_t payload_size);

    void (*log)(void *user_data, int level, const char *message);
} OurMp3HostApi;

typedef int (*OurMp3PluginInit)(const OurMp3HostApi *host);
typedef void (*OurMp3PluginShutdown)(const OurMp3HostApi *host);

typedef struct {
    OurMp3PluginInfo info;
    OurMp3PluginInit init;
    OurMp3PluginShutdown shutdown;
} OurMp3PluginDescriptor;

typedef const OurMp3PluginDescriptor *(*OurMp3PluginEntry)(void);

#define OURMP3_PLUGIN_ENTRY_SYMBOL "ourmp3_plugin_get_descriptor"

/*
 * A plugin must export this function from its shared library.
 * The descriptor and all strings it references must remain valid until shutdown.
 */
OURMP3_PLUGIN_EXPORT const OurMp3PluginDescriptor *
ourmp3_plugin_get_descriptor(void);
