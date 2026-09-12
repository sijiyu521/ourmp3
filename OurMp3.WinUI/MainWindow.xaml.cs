using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using System.Collections.ObjectModel;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.Media.Core;
using Windows.ApplicationModel.DataTransfer;
using WinRT.Interop;

namespace OurMp3.WinUI;

public sealed partial class MainWindow : Window
{
    private readonly ObservableCollection<TrackItem> _tracks = new();

    public MainWindow()
    {
        InitializeComponent();
        Playlist.ItemsSource = _tracks;
        Player.MediaPlayer.Volume = VolumeSlider.Value;
        Player.MediaPlayer.MediaEnded += MediaPlayer_MediaEnded;
    }

    private async void OpenFiles_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileOpenPicker();
        picker.FileTypeFilter.Add(".mp3");
        picker.FileTypeFilter.Add(".wav");
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(this));

        var files = await picker.PickMultipleFilesAsync();
        AddFiles(files);
    }

    private async void Playlist_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (Playlist.SelectedItem is not TrackItem track)
        {
            return;
        }

        try
        {
            var file = await StorageFile.GetFileFromPathAsync(track.Path);
            Player.Source = MediaSource.CreateFromStorageFile(file);
            TrackTitle.Text = file.DisplayName;
            StatusText.Text = "已加载，点击播放";
            ErrorBar.IsOpen = false;
        }
        catch (FileNotFoundException)
        {
            ShowError($"文件不存在：{track.Title}");
        }
        catch (UnauthorizedAccessException)
        {
            ShowError($"无法访问文件：{track.Title}");
        }
    }

    private void Play_Click(object sender, RoutedEventArgs e)
    {
        if (Player.Source is null)
        {
            ShowError("请先从播放列表选择一个文件。");
            return;
        }

        Player.MediaPlayer.Play();
        StatusText.Text = "正在播放";
    }

    private void Pause_Click(object sender, RoutedEventArgs e)
    {
        Player.MediaPlayer.Pause();
        StatusText.Text = "已暂停";
    }

    private void Stop_Click(object sender, RoutedEventArgs e)
    {
        Player.MediaPlayer.Pause();
        Player.MediaPlayer.PlaybackSession.Position = TimeSpan.Zero;
        StatusText.Text = "已停止";
    }

    private void VolumeSlider_ValueChanged(object sender, RangeBaseValueChangedEventArgs e)
    {
        if (Player?.MediaPlayer is not null)
        {
            Player.MediaPlayer.Volume = e.NewValue;
        }
    }

    private void ClearPlaylist_Click(object sender, RoutedEventArgs e)
    {
        Player.MediaPlayer.Pause();
        Player.Source = null;
        _tracks.Clear();
        UpdatePlaylistSummary();
        TrackTitle.Text = "请选择一个 MP3 文件开始播放";
        StatusText.Text = "就绪";
    }

    private void RootGrid_DragOver(object sender, DragEventArgs e)
    {
        e.AcceptedOperation = DataPackageOperation.Copy;
    }

    private async void RootGrid_Drop(object sender, DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems))
        {
            return;
        }

        var items = await e.DataView.GetStorageItemsAsync();
        AddFiles(items.OfType<StorageFile>());
    }

    private void RootGrid_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == Windows.System.VirtualKey.Space)
        {
            if (Player.MediaPlayer.PlaybackSession.PlaybackState ==
                Windows.Media.Playback.MediaPlaybackState.Playing)
            {
                Pause_Click(sender, e);
            }
            else
            {
                Play_Click(sender, e);
            }

            e.Handled = true;
        }
    }

    private void MediaPlayer_MediaEnded(Windows.Media.Playback.MediaPlayer sender, object args)
    {
        if (Playlist.SelectedIndex + 1 >= _tracks.Count)
        {
            StatusText.Text = "播放完成";
            return;
        }

        Playlist.SelectedIndex++;
        Player.MediaPlayer.Play();
        StatusText.Text = "正在播放";
    }

    private void AddFiles(IEnumerable<StorageFile> files)
    {
        foreach (var file in files.Where(IsSupportedAudioFile))
        {
            if (_tracks.All(track => !StringComparer.OrdinalIgnoreCase.Equals(track.Path, file.Path)))
            {
                _tracks.Add(new TrackItem(file.Path, file.DisplayName));
            }
        }

        UpdatePlaylistSummary();
        if (Playlist.SelectedIndex < 0 && _tracks.Count > 0)
        {
            Playlist.SelectedIndex = 0;
        }
    }

    private static bool IsSupportedAudioFile(StorageFile file)
    {
        return file.FileType.Equals(".mp3", StringComparison.OrdinalIgnoreCase) ||
               file.FileType.Equals(".wav", StringComparison.OrdinalIgnoreCase);
    }

    private void UpdatePlaylistSummary()
    {
        PlaylistSummary.Text = $"播放列表 ({_tracks.Count})";
    }

    private void ShowError(string message)
    {
        ErrorBar.Message = message;
        ErrorBar.IsOpen = true;
    }
}
