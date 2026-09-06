#define OURMP3_PLUGIN_BUILD
#include "../plugin_api.h"

static int echo_init(const OurMp3HostApi *host)
{
    const char message[] = "echo plugin ready";
    return host->emit(host->user_data, "plugin.ready", message, sizeof(message) - 1);
}

static void echo_shutdown(const OurMp3HostApi *host)
{
    (void)host;
}

static const OurMp3PluginDescriptor descriptor = {
    { OURMP3_PLUGIN_API_VERSION, "example.echo", "Echo", "1.0.0",
      OURMP3_PLUGIN_COMMAND },
    echo_init,
    echo_shutdown
};

OURMP3_PLUGIN_EXPORT const OurMp3PluginDescriptor *
ourmp3_plugin_get_descriptor(void)
{
    return &descriptor;
}
