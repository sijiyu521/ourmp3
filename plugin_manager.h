#pragma once

#include "plugin_api.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct OurMp3PluginManager OurMp3PluginManager;

OurMp3PluginManager *ourmp3_plugin_manager_create(void);
void ourmp3_plugin_manager_destroy(OurMp3PluginManager *manager);

/* Registers a statically linked plugin using the same ABI as a dynamic plugin. */
int ourmp3_plugin_manager_register(OurMp3PluginManager *manager,
                                    const OurMp3PluginDescriptor *descriptor);

/* Loads one shared library and initializes its plugin. */
int ourmp3_plugin_manager_load(OurMp3PluginManager *manager,
                                const char *path);

/* Shuts down and unloads a plugin identified by its stable id. */
int ourmp3_plugin_manager_unload(OurMp3PluginManager *manager,
                                  const char *plugin_id);

const OurMp3PluginDescriptor *
ourmp3_plugin_manager_find(const OurMp3PluginManager *manager,
                           const char *plugin_id);

void *ourmp3_plugin_manager_get_service(const OurMp3PluginManager *manager,
                                        const char *service_id);

size_t ourmp3_plugin_manager_count(const OurMp3PluginManager *manager);

#ifdef __cplusplus
}
#endif
