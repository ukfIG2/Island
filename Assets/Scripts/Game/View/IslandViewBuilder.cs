using UnityEngine;

namespace ResortEmpire.Game.View
{
    public static class IslandViewBuilder
    {
        public static void Build(GameBootstrap host, GameController game)
        {
            new GameObject("IslandView").AddComponent<IslandView>().Init(game);
        }
    }
}
