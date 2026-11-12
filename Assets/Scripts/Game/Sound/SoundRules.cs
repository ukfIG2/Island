using System.Collections.Generic;

namespace ResortEmpire.Game.Sound
{
    // CAM-117: when a cue may sound. Plain C# on purpose, so it can be tested without a speaker.
    // The Sound switch silences effects and atmosphere, the Music switch silences music, and both apply at once.
    // A cue never sounds again within its minimum gap, so game speed x4 or sixteen arriving guests cannot machine-gun.
    public sealed class SoundRules
    {
        readonly AppSettings _settings;
        readonly Dictionary<SoundCue, float> _last = new Dictionary<SoundCue, float>();
        readonly Dictionary<int, float> _lastInGroup = new Dictionary<int, float>();

        public SoundRules(AppSettings settings) => _settings = settings;

        public bool SoundOn => _settings.SoundOn;
        public bool MusicOn => _settings.MusicOn;

        // True when the cue may sound now (and counts it as played). Loops and music are not "played" one by one.
        public bool TryPlay(SoundCue cue, float now)
        {
            var info = SoundCues.Info(cue);
            if (info.Loop || info.Category == SoundCategory.Music) return false;
            if (!_settings.SoundOn) return false;
            if (_last.TryGetValue(cue, out float at) && now - at < info.MinGap) return false;
            if (info.Group != 0 && _lastInGroup.TryGetValue(info.Group, out float groupAt) && now - groupAt < info.GroupGap) return false;
            _last[cue] = now;
            if (info.Group != 0) _lastInGroup[info.Group] = now;
            return true;
        }
    }
}
