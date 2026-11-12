namespace ResortEmpire.Game.Sound
{
    // Whatever makes the sound: the SoundDirector in the game, a recorder in tests.
    public interface ISoundSink
    {
        void Play(SoundCue cue, float volume);
    }

    // The one door to sound for code that is not part of the sound system (the interface, the island). Asking for a
    // sound when nothing is listening does nothing, so no screen needs to care whether sound exists.
    public static class Sfx
    {
        public static ISoundSink Sink { get; set; }

        public static void Play(SoundCue cue, float volume = 1f) => Sink?.Play(cue, volume);
    }
}
