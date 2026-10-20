using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Sits on a building's root so a tap on any of its colliders resolves to the building.
    public sealed class BuildingTag : MonoBehaviour
    {
        public BuildingId Id;
    }
}
