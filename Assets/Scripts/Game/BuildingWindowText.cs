using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // CAM-138: the words of the building window during a wave. Counts of seats and of guests in line, the status word
    // and a calm phrase when the line has waited long; never a satisfaction number and never happy or unhappy counts
    // (no live satisfaction signal during a wave; dissatisfaction is shown only on the result).
    public static class BuildingWindowText
    {
        public static string Worker(bool here) => here ? "Worker here" : "No Worker";

        public static string Seats(int inUse, int seats) => inUse + " of " + seats + " seats in use";

        public static string Waiting(int guests) =>
            guests <= 0 ? "Nobody waiting" : guests == 1 ? "1 guest waiting" : guests + " guests waiting";

        // Past the patience grace, the first guest in line has waited long enough to start to mind.
        public static string LongWait(float longestWait, TuningConfig t) =>
            longestWait > t.PatienceGraceSeconds ? "Guests are waiting a while" : null;

        public static string Serves(NeedId need) =>
            "Serves " + ResultText.NeedName(need) + (need == NeedId.OceanView ? " · premium" : "");
    }
}
