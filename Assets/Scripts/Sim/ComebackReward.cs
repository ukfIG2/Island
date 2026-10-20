namespace ResortEmpire.Sim
{
    public readonly struct ComebackResult
    {
        public ComebackResult(bool due, int coins, int energy)
        {
            Due = due;
            Coins = coins;
            Energy = energy;
        }

        public bool Due { get; }       // the player was away long enough for the welcome-back gift
        public int Coins { get; }      // 0 when not due
        public int Energy { get; }     // 0 when not due
    }

    // P14 / GDD §8: a fixed welcome-back gift after at least ComebackAfterSeconds away, once per return
    // (the game layer stores the new "last seen" time after granting it). Never a function of how long
    // the player was away beyond the threshold; the resort never degrades. Pure: the caller passes both
    // times, so there is no clock in the sim.
    public static class ComebackReward
    {
        public static ComebackResult Evaluate(long lastSeenUnixSeconds, long nowUnixSeconds, TuningConfig tuning)
        {
            var t = tuning ?? TuningConfig.Default;
            bool due = t.MvpSystems
                && lastSeenUnixSeconds > 0                                   // 0 = no earlier session
                && nowUnixSeconds - lastSeenUnixSeconds >= t.ComebackAfterSeconds; // a clock set back is never due
            return due ? new ComebackResult(true, t.ComebackCoins, t.ComebackEnergy) : new ComebackResult(false, 0, 0);
        }
    }
}
