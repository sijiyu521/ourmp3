#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// 错误码定义
typedef enum {
    MP3_OK = 0,            // 成功
    MP3_ERR_INVALID_ARGS,  // 参数无效
    MP3_ERR_FILE_NOT_FOUND,// 文件不存在
    MP3_ERR_DECODE_FAIL,   // 解码失败
    MP3_ERR_AUDIO_BACKEND  // 音频后端错误
} MP3_Error;

// 媒体基本信息
typedef struct {
    const char *filename;
    int         sample_rate;   // 采样率 (Hz)
    int         channels;      // 声道数 (1=单声, 2=立体声)
    double      duration_ms;   // 总时长 (毫秒)
} MP3_Info;

// 播放器上下文句柄（前向声明，实现文件中定义具体成员）
typedef struct mp3_player_context* PlayerContext;

// ==========================
// 核心函数原型声明
// ==========================

/**
 * @brief 创建播放器实例
 * @param path MP3 文件路径
 * @param out_ctx 输出的播放器指针
 * @return MP3_Error
 */
MP3_Error mp3player_init(const char *path, PlayerContext *out_ctx);

/**
 * @brief 开始或恢复播放
 */
MP3_Error mp3player_play(PlayerContext ctx);

/**
 * @brief 暂停播放
 */
MP3_Error mp3player_pause(PlayerContext ctx);

/**
 * @brief 停止播放
 */
MP3_Error mp3player_stop(PlayerContext ctx);

/**
 * @brief 销毁播放器并释放资源
 */
void mp3player_exit(PlayerContext ctx);

/**
 * @brief 设置音量 (0.0 - 1.0)
 */
void mp3player_set_volume(PlayerContext ctx, float volume);

/**
 * @brief 获取当前播放进度 (毫秒)
 */
double mp3player_get_time(PlayerContext ctx);