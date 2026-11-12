namespace ResortEmpire.Game.Sound
{
    // CAM-117: every sound the game can make. A cue is a moment ("a Worker was moved"), not a file: the file behind it
    // can be swapped without touching the code that asks for it.
    public enum SoundCue
    {
        Click,
    }

    public enum SoundCategory
    {
        Effect,         // short sounds for what the player does and what happens; the Sound switch
        Atmosphere,     // the sea, the wind, gulls, rain; the Sound switch
        Music           // the Music switch
    }

    // How a cue behaves: how loud it is, whether it loops, and how soon it may sound again.
    public readonly struct CueInfo
    {
        public readonly SoundCategory Category;
        public readonly float Volume;       // 0..1, before the player's switches
        public readonly bool Loop;
        public readonly float MinGap;       // real seconds before the same cue may sound again
        public readonly int Group;          // 0 = none; cues of one group also keep a gap from each other
        public readonly float GroupGap;

        public CueInfo(SoundCategory category, float volume, float minGap = 0f, bool loop = false, int group = 0, float groupGap = 0f)
        {
            Category = category;
            Volume = volume;
            MinGap = minGap;
            Loop = loop;
            Group = group;
            GroupGap = groupGap;
        }
    }

    public static class SoundCues
    {
        public static CueInfo Info(SoundCue cue)
        {
            switch (cue)
            {
                case SoundCue.Click: return new CueInfo(SoundCategory.Effect, 0.40f, minGap: 0.05f);
                default: return new CueInfo(SoundCategory.Effect, 0.5f);
            }
        }
    }
}
