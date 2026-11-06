using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Progress along an island route: on foot, stopping at each lift until the cabin takes the walker, riding it
    // to the other stop and walking on. Shared by guests and Workers; positions are on the walking surface.
    sealed class RouteWalk
    {
        IslandPaths.Route _path;
        int _nextLeg;
        bool _riding;

        public float Walked { get; private set; }
        public float Length => _path.Length;
        public bool Arrived => !_riding && Walked >= _path.Length;
        public bool Waiting { get; private set; }   // standing at a lift stop or riding the cabin

        public void Start(IslandPaths.Route path)
        {
            _path = path;
            _nextLeg = 0;
            _riding = false;
            Walked = 0f;
            Waiting = false;
        }

        // Moves on by up to `distance` and returns where the walker stands now.
        public Vector3 Advance(float distance)
        {
            if (_riding)
            {
                var ride = _path.LiftLegs[_nextLeg];
                Waiting = true;
                if (!ride.Lift.Arrived(this)) return ride.Lift.Floor;
                ride.Lift.StepOff(this);
                _riding = false;
                Walked = _path.DistanceAt(ride.At + 1);
                _nextLeg++;
            }

            Waiting = false;
            if (_nextLeg < _path.LiftLegs.Length)
            {
                var leg = _path.LiftLegs[_nextLeg];
                float board = _path.DistanceAt(leg.At);
                if (Walked + distance >= board)
                {
                    distance = board - Walked;
                    Waiting = true;
                    _riding = leg.Lift.TryBoard(this, leg.Lift.StopNear(_path.Points[leg.At]));
                }
            }
            Walked += distance;
            return _path.PointAt(Walked);
        }

        public Vector3 Ahead(float distance) => _path.PointAt(Walked + distance);

        // A walker taken off the island gives up any lift it waited for or rode.
        public void Abandon()
        {
            if (_path == null) return;
            foreach (var leg in _path.LiftLegs) leg.Lift.StepOff(this);
        }
    }
}
