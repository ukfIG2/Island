using ResortEmpire.Sim;

namespace ResortEmpire.Game.Sound
{
    // CAM-117: which music fits the moment. One calm mood between waves, under the menus and over the island; a
    // busier one while a wave runs. Under the result screen the music goes quieter. Plain C# on purpose, so it can
    // be tested.
    public static class MusicMood
    {
        public const float DuckedLevel = 0.5f;      // how loud music is under the result screen, next to normal

        // True while a wave is under way: guests arriving, being served, the last lines emptying.
        public static bool Busy(GameController game)
        {
            var sim = game.ActiveWave;
            return sim != null && sim.Phase != WavePhase.WaveComplete;
        }

        // The result screen is open: the music steps back so the stars can be heard.
        public static float Duck(GameController game) => game.CurrentPhase == WavePhase.WaveComplete ? DuckedLevel : 1f;
    }
}
