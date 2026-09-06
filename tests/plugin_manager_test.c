#include "../plugin_manager.h"

#include <assert.h>

static int service_value = 42;
static int received_events;

static void on_event(const char *event_name, const void *payload,
                     size_t payload_size, void *user_data)
{
    (void)payload;
    (void)user_data;
    assert(event_name[0] != '\0');
    assert(payload_size == 0);
    ++received_events;
}

static int test_init(const OurMp3HostApi *host)
{
    assert(host->register_service(host->user_data, "test.value",
                                   &service_value, NULL) == 0);
    assert(host->subscribe(host->user_data, "test.event", on_event, NULL) == 0);
    assert(host->emit(host->user_data, "test.event", NULL, 0) == 0);
    return 0;
}

static void test_shutdown(const OurMp3HostApi *host)
{
    assert(host->unsubscribe(host->user_data, "test.event", on_event, NULL) == 0);
    assert(host->unregister_service(host->user_data, "test.value") == 0);
}

static const OurMp3PluginDescriptor test_plugin = {
    { OURMP3_PLUGIN_API_VERSION, "test.plugin", "Test", "1.0.0",
      OURMP3_PLUGIN_SERVICE },
    test_init,
    test_shutdown
};

int main(void)
{
    OurMp3PluginManager *manager = ourmp3_plugin_manager_create();

    assert(manager);
    assert(ourmp3_plugin_manager_register(manager, &test_plugin) == 0);
    assert(ourmp3_plugin_manager_count(manager) == 1);
    assert(ourmp3_plugin_manager_find(manager, "test.plugin") == &test_plugin);
    assert(ourmp3_plugin_manager_find(manager, "missing") == NULL);
    assert(ourmp3_plugin_manager_get_service(manager, "test.value") ==
           &service_value);
    ourmp3_plugin_manager_destroy(manager);
    assert(received_events == 1);
    return 0;
}
