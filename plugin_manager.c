#include "plugin_manager.h"

#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#  define WIN32_LEAN_AND_MEAN
#  include <windows.h>
typedef HMODULE OurMp3Module;
#else
#  include <dlfcn.h>
typedef void *OurMp3Module;
#endif

typedef struct OurMp3Service {
    char *id;
    void *value;
    OurMp3ServiceDestroy destroy;
    struct OurMp3LoadedPlugin *owner;
    struct OurMp3Service *next;
} OurMp3Service;

typedef struct OurMp3Subscription {
    char *event_name;
    OurMp3EventHandler handler;
    void *user_data;
    struct OurMp3LoadedPlugin *owner;
    struct OurMp3Subscription *next;
} OurMp3Subscription;

typedef struct OurMp3LoadedPlugin {
    const OurMp3PluginDescriptor *descriptor;
    OurMp3Module module;
    struct OurMp3LoadedPlugin *next;
} OurMp3LoadedPlugin;

struct OurMp3PluginManager {
    OurMp3HostApi host;
    OurMp3Service *services;
    OurMp3Subscription *subscriptions;
    OurMp3LoadedPlugin *plugins;
    OurMp3LoadedPlugin *active_plugin;
};

static int valid_string(const char *value)
{
    return value != NULL && value[0] != '\0';
}

static char *copy_string(const char *value)
{
    size_t length;
    char *copy;

    if (!value) {
        return NULL;
    }
    length = strlen(value) + 1;
    copy = (char *)malloc(length);
    if (copy) {
        memcpy(copy, value, length);
    }
    return copy;
}

static OurMp3PluginManager *manager_from_host(void *user_data)
{
    return (OurMp3PluginManager *)user_data;
}

static int host_register_service(void *user_data, const char *service_id,
                                 void *service, OurMp3ServiceDestroy destroy)
{
    OurMp3PluginManager *manager = manager_from_host(user_data);
    OurMp3Service *entry;

    if (!manager || !valid_string(service_id) || !service ||
        manager->host.get_service(user_data, service_id)) {
        return -1;
    }
    entry = (OurMp3Service *)calloc(1, sizeof(*entry));
    if (!entry) {
        return -1;
    }
    entry->id = copy_string(service_id);
    if (!entry->id) {
        free(entry);
        return -1;
    }
    entry->value = service;
    entry->destroy = destroy;
    entry->owner = manager->active_plugin;
    entry->next = manager->services;
    manager->services = entry;
    return 0;
}

static int host_unregister_service(void *user_data, const char *service_id)
{
    OurMp3PluginManager *manager = manager_from_host(user_data);
    OurMp3Service **cursor;

    if (!manager || !valid_string(service_id)) {
        return -1;
    }
    for (cursor = &manager->services; *cursor; cursor = &(*cursor)->next) {
        OurMp3Service *entry = *cursor;
        if (strcmp(entry->id, service_id) == 0) {
            *cursor = entry->next;
            if (entry->destroy) {
                entry->destroy(entry->value);
            }
            free(entry->id);
            free(entry);
            return 0;
        }
    }
    return -1;
}

static void *host_get_service(void *user_data, const char *service_id)
{
    OurMp3PluginManager *manager = manager_from_host(user_data);
    OurMp3Service *entry;

    if (!manager || !valid_string(service_id)) {
        return NULL;
    }
    for (entry = manager->services; entry; entry = entry->next) {
        if (strcmp(entry->id, service_id) == 0) {
            return entry->value;
        }
    }
    return NULL;
}

static int host_subscribe(void *user_data, const char *event_name,
                          OurMp3EventHandler handler, void *handler_user_data)
{
    OurMp3PluginManager *manager = manager_from_host(user_data);
    OurMp3Subscription *entry;

    if (!manager || !valid_string(event_name) || !handler) {
        return -1;
    }
    entry = (OurMp3Subscription *)calloc(1, sizeof(*entry));
    if (!entry) {
        return -1;
    }
    entry->event_name = copy_string(event_name);
    if (!entry->event_name) {
        free(entry);
        return -1;
    }
    entry->handler = handler;
    entry->user_data = handler_user_data;
    entry->owner = manager->active_plugin;
    entry->next = manager->subscriptions;
    manager->subscriptions = entry;
    return 0;
}

static int host_unsubscribe(void *user_data, const char *event_name,
                            OurMp3EventHandler handler, void *handler_user_data)
{
    OurMp3PluginManager *manager = manager_from_host(user_data);
    OurMp3Subscription **cursor;

    if (!manager || !valid_string(event_name) || !handler) {
        return -1;
    }
    for (cursor = &manager->subscriptions; *cursor; cursor = &(*cursor)->next) {
        OurMp3Subscription *entry = *cursor;
        if (strcmp(entry->event_name, event_name) == 0 &&
            entry->handler == handler && entry->user_data == handler_user_data) {
            *cursor = entry->next;
            free(entry->event_name);
            free(entry);
            return 0;
        }
    }
    return -1;
}

static int host_emit(void *user_data, const char *event_name,
                     const void *payload, size_t payload_size)
{
    OurMp3PluginManager *manager = manager_from_host(user_data);
    OurMp3Subscription *entry;

    if (!manager || !valid_string(event_name) ||
        (payload_size != 0 && !payload)) {
        return -1;
    }
    for (entry = manager->subscriptions; entry; entry = entry->next) {
        if (strcmp(entry->event_name, event_name) == 0) {
            entry->handler(event_name, payload, payload_size, entry->user_data);
        }
    }
    return 0;
}

static void host_log(void *user_data, int level, const char *message)
{
    (void)user_data;
    (void)level;
    (void)message;
}

static int descriptor_is_valid(const OurMp3PluginDescriptor *descriptor)
{
    return descriptor &&
           descriptor->info.api_version == OURMP3_PLUGIN_API_VERSION &&
           valid_string(descriptor->info.id) &&
           valid_string(descriptor->info.name) &&
           valid_string(descriptor->info.version) &&
           descriptor->init && descriptor->shutdown;
}

OurMp3PluginManager *ourmp3_plugin_manager_create(void)
{
    OurMp3PluginManager *manager =
        (OurMp3PluginManager *)calloc(1, sizeof(*manager));
    if (!manager) {
        return NULL;
    }
    manager->host.api_version = OURMP3_PLUGIN_API_VERSION;
    manager->host.user_data = manager;
    manager->host.register_service = host_register_service;
    manager->host.unregister_service = host_unregister_service;
    manager->host.get_service = host_get_service;
    manager->host.subscribe = host_subscribe;
    manager->host.unsubscribe = host_unsubscribe;
    manager->host.emit = host_emit;
    manager->host.log = host_log;
    return manager;
}

static void close_module(OurMp3Module module)
{
    if (!module) {
        return;
    }
#ifdef _WIN32
    FreeLibrary(module);
#else
    dlclose(module);
#endif
}

static void remove_plugin_resources(OurMp3PluginManager *manager,
                                    OurMp3LoadedPlugin *plugin)
{
    OurMp3Service **service_cursor;
    OurMp3Subscription **subscription_cursor;

    for (service_cursor = &manager->services; *service_cursor;) {
        OurMp3Service *service = *service_cursor;
        if (service->owner == plugin) {
            *service_cursor = service->next;
            if (service->destroy) {
                service->destroy(service->value);
            }
            free(service->id);
            free(service);
        } else {
            service_cursor = &service->next;
        }
    }
    for (subscription_cursor = &manager->subscriptions;
         *subscription_cursor;) {
        OurMp3Subscription *subscription = *subscription_cursor;
        if (subscription->owner == plugin) {
            *subscription_cursor = subscription->next;
            free(subscription->event_name);
            free(subscription);
        } else {
            subscription_cursor = &subscription->next;
        }
    }
}

void ourmp3_plugin_manager_destroy(OurMp3PluginManager *manager)
{
    OurMp3LoadedPlugin *plugin;
    OurMp3Service *service;
    OurMp3Subscription *subscription;

    if (!manager) {
        return;
    }
    while ((plugin = manager->plugins) != NULL) {
        manager->plugins = plugin->next;
        plugin->descriptor->shutdown(&manager->host);
        remove_plugin_resources(manager, plugin);
        close_module(plugin->module);
        free(plugin);
    }
    while ((service = manager->services) != NULL) {
        manager->services = service->next;
        if (service->destroy) {
            service->destroy(service->value);
        }
        free(service->id);
        free(service);
    }
    while ((subscription = manager->subscriptions) != NULL) {
        manager->subscriptions = subscription->next;
        free(subscription->event_name);
        free(subscription);
    }
    free(manager);
}

int ourmp3_plugin_manager_register(OurMp3PluginManager *manager,
                                   const OurMp3PluginDescriptor *descriptor)
{
    OurMp3LoadedPlugin *entry;

    if (!manager || !descriptor_is_valid(descriptor) ||
        ourmp3_plugin_manager_find(manager, descriptor->info.id)) {
        return -1;
    }
    entry = (OurMp3LoadedPlugin *)calloc(1, sizeof(*entry));
    if (!entry) {
        return -1;
    }
    manager->active_plugin = entry;
    if (descriptor->init(&manager->host) != 0) {
        manager->active_plugin = NULL;
        remove_plugin_resources(manager, entry);
        free(entry);
        return -1;
    }
    manager->active_plugin = NULL;
    entry->descriptor = descriptor;
    entry->next = manager->plugins;
    manager->plugins = entry;
    return 0;
}

int ourmp3_plugin_manager_load(OurMp3PluginManager *manager, const char *path)
{
    OurMp3Module module;
    OurMp3PluginEntry entry;
    const OurMp3PluginDescriptor *descriptor;

    if (!manager || !valid_string(path)) {
        return -1;
    }
#ifdef _WIN32
    module = LoadLibraryA(path);
    if (!module) {
        return -1;
    }
    {
        union {
            FARPROC raw;
            OurMp3PluginEntry typed;
        } symbol;
        symbol.raw = GetProcAddress(module, OURMP3_PLUGIN_ENTRY_SYMBOL);
        entry = symbol.typed;
    }
#else
    module = dlopen(path, RTLD_NOW);
    if (!module) {
        return -1;
    }
    entry = (OurMp3PluginEntry)dlsym(module, OURMP3_PLUGIN_ENTRY_SYMBOL);
#endif
    if (!entry) {
        close_module(module);
        return -1;
    }
    descriptor = entry();
    if (ourmp3_plugin_manager_register(manager, descriptor) != 0) {
        close_module(module);
        return -1;
    }
    manager->plugins->module = module;
    return 0;
}

int ourmp3_plugin_manager_unload(OurMp3PluginManager *manager,
                                 const char *plugin_id)
{
    OurMp3LoadedPlugin **cursor;

    if (!manager || !valid_string(plugin_id)) {
        return -1;
    }
    for (cursor = &manager->plugins; *cursor; cursor = &(*cursor)->next) {
        OurMp3LoadedPlugin *plugin = *cursor;
        if (strcmp(plugin->descriptor->info.id, plugin_id) == 0) {
            *cursor = plugin->next;
            plugin->descriptor->shutdown(&manager->host);
            remove_plugin_resources(manager, plugin);
            close_module(plugin->module);
            free(plugin);
            return 0;
        }
    }
    return -1;
}

const OurMp3PluginDescriptor *
ourmp3_plugin_manager_find(const OurMp3PluginManager *manager,
                           const char *plugin_id)
{
    OurMp3LoadedPlugin *plugin;

    if (!manager || !valid_string(plugin_id)) {
        return NULL;
    }
    for (plugin = manager->plugins; plugin; plugin = plugin->next) {
        if (strcmp(plugin->descriptor->info.id, plugin_id) == 0) {
            return plugin->descriptor;
        }
    }
    return NULL;
}

void *ourmp3_plugin_manager_get_service(const OurMp3PluginManager *manager,
                                        const char *service_id)
{
    OurMp3Service *service;

    if (!manager || !valid_string(service_id)) {
        return NULL;
    }
    for (service = manager->services; service; service = service->next) {
        if (strcmp(service->id, service_id) == 0) {
            return service->value;
        }
    }
    return NULL;
}

size_t ourmp3_plugin_manager_count(const OurMp3PluginManager *manager)
{
    size_t count = 0;
    OurMp3LoadedPlugin *plugin;

    if (!manager) {
        return 0;
    }
    for (plugin = manager->plugins; plugin; plugin = plugin->next) {
        ++count;
    }
    return count;
}
