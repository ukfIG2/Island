using UnityEngine;

namespace ResortEmpire.Game.View
{
    public static class IslandViewBuilder
    {
        public static IslandView Build(GameBootstrap host, GameController game)
        {
            var view = new GameObject("IslandView").AddComponent<IslandView>();
            view.Init(game);
            return view;
        }
    }
}
