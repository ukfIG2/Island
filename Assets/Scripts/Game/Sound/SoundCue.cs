namespace ResortEmpire.Game.Sound
{
    // CAM-117: every sound the game can make. A cue is a moment ("a Worker was moved"), not a file: the file behind it
    // can be swapped without touching the code that asks for it.
    public enum SoundCue
    {
        // the interface
        Click,
        // Workers
        WorkerMoved,
        // the lines at the buildings
        LineGrowing,        // a line starts to grow: gentle, once per change
        LineCatchingUp,     // help landed and the line is shrinking
        SuddenRush,
        // the vessel that brings a wave, heard coming in and, fainter, leaving
        BoatShuttle, BoatSpeedboats, BoatFerry, BoatSeaplane,
        // the flow of a wave
        WaveStart,
        GuestsArrived,      // arrivals have closed; the wave runs on until the last line is empty
        ResultOneStar, ResultTwoStars, ResultThreeStars, ResultFourStars, ResultFiveStars, ResultPerfect,
        // Coins, Energy and growth
        RewardsClaimed,
        SpeedUp,
        EnergyGained,
        Upgrade,
        Unlock,
        AreaOffer,
        ResortSummary,
        // the island around the player
        Ocean,              // loop: the sea and a light wind, always
        Rain,               // loop: in the rainy waves
        Gull,               // now and then
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
                case SoundCue.WorkerMoved: return new CueInfo(SoundCategory.Effect, 0.70f, minGap: 0.10f);
                // The two line signals share a group, so a line that flickers never stacks them into a nag.
                case SoundCue.LineGrowing: return new CueInfo(SoundCategory.Effect, 0.55f, minGap: 6f, group: 1, groupGap: 2.5f);
                case SoundCue.LineCatchingUp: return new CueInfo(SoundCategory.Effect, 0.55f, minGap: 4f, group: 1, groupGap: 2.5f);
                case SoundCue.SuddenRush: return new CueInfo(SoundCategory.Effect, 0.70f, minGap: 5f);
                case SoundCue.BoatShuttle:
                case SoundCue.BoatSpeedboats:
                case SoundCue.BoatFerry:
                case SoundCue.BoatSeaplane: return new CueInfo(SoundCategory.Effect, 0.65f, minGap: 1f);
                case SoundCue.WaveStart: return new CueInfo(SoundCategory.Effect, 0.65f, minGap: 2f);
                case SoundCue.GuestsArrived: return new CueInfo(SoundCategory.Effect, 0.50f, minGap: 2f);
                case SoundCue.ResultOneStar:
                case SoundCue.ResultTwoStars:
                case SoundCue.ResultThreeStars:
                case SoundCue.ResultFourStars:
                case SoundCue.ResultFiveStars:
                case SoundCue.ResultPerfect: return new CueInfo(SoundCategory.Effect, 0.65f, minGap: 1f);
                case SoundCue.RewardsClaimed: return new CueInfo(SoundCategory.Effect, 0.60f, minGap: 0.2f);
                case SoundCue.SpeedUp: return new CueInfo(SoundCategory.Effect, 0.55f, minGap: 0.3f);
                case SoundCue.EnergyGained: return new CueInfo(SoundCategory.Effect, 0.55f, minGap: 0.3f);
                case SoundCue.Upgrade: return new CueInfo(SoundCategory.Effect, 0.65f, minGap: 0.3f);
                case SoundCue.Unlock: return new CueInfo(SoundCategory.Effect, 0.70f, minGap: 0.3f);
                case SoundCue.AreaOffer: return new CueInfo(SoundCategory.Effect, 0.55f, minGap: 1f);
                case SoundCue.ResortSummary: return new CueInfo(SoundCategory.Effect, 0.65f, minGap: 2f);
                case SoundCue.Ocean: return new CueInfo(SoundCategory.Atmosphere, 0.30f, loop: true);
                case SoundCue.Rain: return new CueInfo(SoundCategory.Atmosphere, 0.28f, loop: true);
                case SoundCue.Gull: return new CueInfo(SoundCategory.Atmosphere, 0.35f, minGap: 8f);
                default: return new CueInfo(SoundCategory.Effect, 0.5f);
            }
        }
    }
}
