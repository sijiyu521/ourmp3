namespace OurMp3.WinUI;

public sealed class TrackItem
{
    public TrackItem(string path, string title)
    {
        Path = path;
        Title = title;
    }

    public string Path { get; }

    public string Title { get; }
}
