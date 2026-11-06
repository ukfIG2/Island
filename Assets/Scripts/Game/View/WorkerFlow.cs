using System;
using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // The Workers on the island, drawn like the web's (ResortWorkerActivity.tsx): a figure in a green shirt and a
    // yellow hat on a green ring, standing at the entrance of each staffed building. When one building loses its
    // Worker and another gains one, that Worker walks the island's paths over. The move itself took effect at
    // once (WR5); the walk is only for show.
    sealed class WorkerFlow
    {
        const float WalkSpeed = 2.15f;   // the web's Worker pace: Workers hurry

        sealed class Figure
        {
            public Transform Body;
            public RouteWalk Walk;       // null while standing at the building
            public BuildingId At;
        }

        readonly Transform _parent;
        readonly Func<BuildingId, IslandPaths.Site> _site;
        readonly Func<BuildingId, BuildingId, IslandPaths.Route> _route;
        readonly Dictionary<BuildingId, Figure> _byBuilding = new Dictionary<BuildingId, Figure>();
        readonly Stack<Figure> _pool = new Stack<Figure>();
        readonly List<BuildingId> _lost = new List<BuildingId>();
        readonly List<BuildingId> _gained = new List<BuildingId>();

        public WorkerFlow(Transform parent, Func<BuildingId, IslandPaths.Site> site,
            Func<BuildingId, BuildingId, IslandPaths.Route> route)
        {
            _parent = parent;
            _site = site;
            _route = route;
        }

        // Called every frame with the resort: a building that lost its Worker while one other gained a Worker is a
        // move; anything else (a new game, a load, a new Worker with an unlock) simply shows the Workers in place.
        public void Sync(ResortState resort, float dt)
        {
            _lost.Clear();
            _gained.Clear();
            foreach (BuildingId id in Enum.GetValues(typeof(BuildingId)))
            {
                var building = resort.Get(id);
                bool staffed = building != null && building.HasWorker;
                bool shown = _byBuilding.ContainsKey(id);
                if (staffed && !shown) _gained.Add(id);
                else if (!staffed && shown) _lost.Add(id);
            }
            if (_lost.Count == 1 && _gained.Count == 1) Move(_lost[0], _gained[0]);
            else
            {
                foreach (var id in _lost) Remove(id);
                foreach (var id in _gained) Stand(Take(id));
            }

            foreach (var figure in _byBuilding.Values) Walk(figure, dt);
        }

        void Move(BuildingId from, BuildingId to)
        {
            var figure = _byBuilding[from];
            _byBuilding.Remove(from);
            _byBuilding[to] = figure;
            figure.At = to;
            var route = _route(from, to);
            if (route == null)
            {
                Stand(figure);
                return;
            }
            figure.Walk?.Abandon();
            figure.Walk = figure.Walk ?? new RouteWalk();
            figure.Walk.Start(IslandPaths.Route.Between(figure.Body.position, route, _site(to).Entrance));
        }

        void Walk(Figure figure, float dt)
        {
            if (figure.Walk == null) return;
            var pos = figure.Walk.Advance(WalkSpeed * dt);
            if (figure.Walk.Arrived)
            {
                Stand(figure);
                return;
            }
            var ahead = figure.Walk.Ahead(0.05f) - pos;
            ahead.y = 0f;
            if (!figure.Walk.Waiting)
            {
                if (ahead.sqrMagnitude > 1e-6f) figure.Body.rotation = Quaternion.LookRotation(ahead);
                pos.y += Mathf.Abs(Mathf.Sin(figure.Walk.Walked * 9f / WalkSpeed)) * 0.035f;
            }
            figure.Body.position = pos;
        }

        // A Worker on duty stands at the building's entrance, facing it.
        void Stand(Figure figure)
        {
            figure.Walk?.Abandon();
            figure.Walk = null;
            var site = _site(figure.At);
            figure.Body.position = site.Entrance;
            var facing = site.Center - site.Entrance;
            facing.y = 0f;
            if (facing.sqrMagnitude > 1e-6f) figure.Body.rotation = Quaternion.LookRotation(facing);
        }

        Figure Take(BuildingId id)
        {
            var figure = _pool.Count > 0 ? _pool.Pop() : new Figure { Body = Build(_parent) };
            figure.Body.gameObject.SetActive(true);
            figure.At = id;
            _byBuilding[id] = figure;
            return figure;
        }

        void Remove(BuildingId id)
        {
            var figure = _byBuilding[id];
            figure.Walk?.Abandon();
            figure.Walk = null;
            figure.Body.gameObject.SetActive(false);
            _byBuilding.Remove(id);
            _pool.Push(figure);
        }

        // The web's Worker: ring, shirt, head and hat, its feet at the origin.
        static Transform Build(Transform parent)
        {
            var body = new GameObject("Worker").transform;
            body.SetParent(parent, false);
            var ring = ViewKit.Hex(0x8BE0AC);
            ring.a = 0.72f;
            var marker = ViewKit.Ring("Ring", body, 0.16f, 0.23f, ring);
            marker.transform.localPosition = new Vector3(0f, 0.015f, 0f);
            marker.GetComponent<Renderer>().sharedMaterial = ViewKit.Flat(ring);
            ViewKit.Prim(PrimitiveType.Cube, "Shirt", body, new Vector3(0f, 0.16f, 0f), new Vector3(0.16f, 0.32f, 0.16f),
                ViewKit.Hex(0x4F8F6B), collider: false);
            ViewKit.Prim(PrimitiveType.Sphere, "Head", body, new Vector3(0f, 0.40f, 0f), Vector3.one * 0.22f,
                ViewKit.Hex(0xD9A47D), collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Hat", body, new Vector3(0f, 0.50f, 0f), new Vector3(0.22f, 0.06f, 0.22f),
                ViewKit.Hex(0xFFD56D), collider: false);
            return body.transform;
        }
    }
}
