using System;
using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S4 Wave Complete: rating, rewards and the reason behind them. The only place a numeric
    // satisfaction ever appears. Tone stays "it went well, I can improve it" — never a loss screen.
    public sealed class WaveCompleteUi
    {
        static readonly Color StarEmpty = new Color(0.23f, 0.37f, 0.42f);
        static readonly Color WentWellColor = new Color(0.62f, 0.86f, 0.66f);

        readonly GameController _game;
        readonly Action _onClaim;
        readonly GameObject _root;
        readonly Text _title;
        readonly Image[] _stars = new Image[5];
        readonly Text _satisfaction;
        readonly Text _served;
        readonly Text _coins;
        readonly Text _energy;
        readonly Text _value;
        readonly Text _wentWell;
        readonly Text _improve;
        readonly Text _leaving;
        readonly Text _thanks;
        readonly Text _claimLabel;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public WaveCompleteUi(Transform canvas, GameController game, Action onClaim)
        {
            _game = game;
            _onClaim = onClaim;
            _root = UiFactory.Overlay(canvas, "WaveComplete", new Color(0f, 0f, 0f, 0.55f)).gameObject;

            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -20f), new Vector2(940f, 820f));

            _title = UiFactory.Label(card, "Title", "", 46, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -92f), new Vector2(-30f, -28f));

            for (int i = 0; i < _stars.Length; i++)
            {
                _stars[i] = UiFactory.Icon(card, "Star" + i, UiFactory.Star, StarEmpty);
                UiFactory.PlaceFixed(_stars[i].gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f),
                    new Vector2((i - 2) * 82f, -150f), new Vector2(70f, 70f));
            }

            _satisfaction = UiFactory.Label(card, "Satisfaction", "", 32, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_satisfaction.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -240f), new Vector2(-30f, -200f));

            _served = UiFactory.Label(card, "Served", "", 24, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_served.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -278f), new Vector2(-30f, -244f));

            var rewards = UiFactory.Row(card, "Rewards", 10f);
            UiFactory.Place(rewards.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -346f), new Vector2(-30f, -296f));
            _coins = Reward(rewards, "Coins", UiFactory.Circle, UiFactory.Gold);
            UiFactory.RowGap(rewards, 36f);
            _energy = Reward(rewards, "Energy", UiFactory.Bolt, UiFactory.Recovering);
            UiFactory.RowGap(rewards, 36f);
            _value = Reward(rewards, "ResortValue", UiFactory.Star, UiFactory.Gold);

            var divider = UiFactory.Go(card, "Divider").AddComponent<Image>();
            divider.color = UiFactory.PanelLight;
            divider.raycastTarget = false;
            UiFactory.Place(divider.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(50f, -370f), new Vector2(-50f, -368f));

            _wentWell = Column(card, "WentWell", "What went well", WentWellColor, 0f, 0.5f, 50f, -20f);
            _improve = Column(card, "NeedsImprovement", "Needs improvement", UiFactory.Recovering, 0.5f, 1f, 20f, -50f);

            _leaving = UiFactory.Label(card, "Leaving", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter, FontStyle.Italic);
            UiFactory.Place(_leaving.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -590f), new Vector2(-40f, -556f));

            _thanks = UiFactory.Label(card, "Thanks", "Prototype complete — thanks for playing!", 28, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_thanks.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -640f), new Vector2(-30f, -600f));

            var claim = UiFactory.TextButton(card, "Claim", "", 34, UiFactory.Cta, UiFactory.Cream, OnClaim);
            UiFactory.PlaceFixed(claim.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(420f, 96f));
            _claimLabel = UiFactory.ButtonLabel(claim);

            _root.SetActive(false);
        }

        static Text Reward(Transform row, string name, Sprite icon, Color iconColor)
        {
            UiFactory.RowIcon(row, name + "Icon", icon, iconColor, 34f);
            return UiFactory.Label(row, name, "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
        }

        static Text Column(Transform card, string name, string header, Color headerColor, float aMin, float aMax,
            float left, float right)
        {
            var head = UiFactory.Label(card, name + "Header", header, 24, headerColor, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(head.gameObject, new Vector2(aMin, 1f), new Vector2(aMax, 1f), new Vector2(left, -424f), new Vector2(right, -390f));
            var body = UiFactory.Label(card, name, "", 24, UiFactory.Cream, TextAnchor.UpperLeft);
            UiFactory.Place(body.gameObject, new Vector2(aMin, 1f), new Vector2(aMax, 1f), new Vector2(left, -540f), new Vector2(right, -432f));
            body.horizontalOverflow = HorizontalWrapMode.Wrap;
            return body;
        }

        public void Show(WaveResult result)
        {
            _root.SetActive(true);
            _title.text = "Wave " + result.WaveIndex + " complete";
            for (int i = 0; i < _stars.Length; i++)
                _stars[i].color = i < result.Stars ? UiFactory.Gold : StarEmpty;

            // Floored, not rounded: 89.6 % must not read as the 90 % a fifth star needs.
            int percent = Mathf.FloorToInt(result.Satisfaction * 100f + 0.001f);
            _satisfaction.text = "Guest satisfaction: " + percent + "%" + (result.Perfect ? " — Perfect!" : "");
            // Every guest is always served before a wave ends (WR3).
            _served.text = "Needs served: " + result.TotalUnits + "/" + result.TotalUnits;

            _coins.text = "+" + UiFactory.Num(result.CoinsEarned) + " Coins";
            _energy.text = "+" + result.EnergyEarned + " Energy";
            _value.text = "+" + result.ResortValueGain + " Resort Value";

            _wentWell.text = WentWell(result, _game.Tuning.PatienceGraceSeconds);
            _improve.text = NeedsImprovement(result);
            _leaving.text = LeavingLine(result.Stars);

            bool last = result.WaveIndex >= _game.LastWaveIndex;
            _thanks.gameObject.SetActive(last);
            _claimLabel.text = last ? "BACK TO ISLAND" : "CLAIM REWARDS";
        }

        void OnClaim()
        {
            _root.SetActive(false);
            _onClaim?.Invoke();
        }

        static string WentWell(WaveResult r, float graceSeconds)
        {
            var quick = new List<NeedId>();
            if (r.AverageWaitByNeed != null)
                foreach (NeedId need in Enum.GetValues(typeof(NeedId)))
                    if (need != r.WorstNeed && r.AverageWaitByNeed.TryGetValue(need, out float wait) && wait <= graceSeconds)
                        quick.Add(need);
            if (quick.Count == 0) return "Every guest was looked after in the end.";

            bool plural = quick.Count > 1 || quick[0] == NeedId.Rooms || quick[0] == NeedId.Drinks;
            var names = new List<string>();
            foreach (var need in quick) names.Add(UiFactory.NeedName(need));
            return JoinNames(names) + (plural ? " were" : " was") + " served quickly.";
        }

        static string NeedsImprovement(WaveResult r)
        {
            if (!r.WorstNeed.HasValue) return "Every line stayed short.";
            string building = GameController.DisplayName(UiFactory.BuildingFor(r.WorstNeed.Value));
            switch (r.WorstNeedCause)
            {
                case BottleneckCause.Staffing: return building + " was without a worker while its line grew.";
                case BottleneckCause.Capacity: return building + " had too few seats for the crowd.";
                default: return "Guests waited longest at the " + building + ".";
            }
        }

        // A picture of the result, never a tally of real guests (UI handoff S4).
        static string LeavingLine(int stars)
        {
            if (stars >= 5) return "";
            if (stars == 4) return "A couple of guests left a little impatient.";
            if (stars == 3) return "A few guests left a bit impatient.";
            return "Quite a few guests left impatient — the resort can do better next time.";
        }

        static string JoinNames(List<string> names)
        {
            if (names.Count == 1) return names[0];
            return string.Join(", ", names.GetRange(0, names.Count - 1)) + " and " + names[names.Count - 1];
        }
    }
}
