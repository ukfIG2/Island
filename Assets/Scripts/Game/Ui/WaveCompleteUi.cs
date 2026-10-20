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
        readonly GameObject _extraRewards;   // second row: only the MVP rewards that are non-zero
        readonly GameObject _reputationIcon;
        readonly Text _reputation;
        readonly GameObject _materialsIcon;
        readonly Text _materials;
        readonly GameObject _extraGap;
        readonly Text _wentWell;
        readonly Text _improve;
        readonly Text _leaving;

        // S8 VIP Complete shares this template (UI F.3): the same card in a lilac style variant.
        readonly Action _onVipClaim;
        readonly Image _card;
        readonly Image _coinsIcon;
        readonly Image _energyIcon;
        readonly Image _valueIcon;
        readonly Image _reputationImage;
        readonly Image _materialsImage;
        bool _vipMode;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;
        public bool ShowingVip => Visible && _vipMode;

        public WaveCompleteUi(Transform canvas, GameController game, Action onClaim, Action onVipClaim = null)
        {
            _game = game;
            _onClaim = onClaim;
            _onVipClaim = onVipClaim;
            _root = UiFactory.Overlay(canvas, "WaveComplete", new Color(0f, 0f, 0f, 0.55f)).gameObject;

            _card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel);
            var card = _card.transform;
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
            _coins = Reward(rewards, "Coins", UiFactory.Circle, UiFactory.Gold, out var coinsIcon);
            UiFactory.RowGap(rewards, 36f);
            _energy = Reward(rewards, "Energy", UiFactory.Bolt, UiFactory.Recovering, out var energyIcon);
            UiFactory.RowGap(rewards, 36f);
            _value = Reward(rewards, "ResortValue", UiFactory.Star, UiFactory.Gold, out var valueIcon);
            _coinsIcon = coinsIcon.GetComponent<Image>();
            _energyIcon = energyIcon.GetComponent<Image>();
            _valueIcon = valueIcon.GetComponent<Image>();

            // Five rewards do not fit one 880-wide row at this size, so Reputation and Materials get their own.
            var extra = UiFactory.Row(card, "ExtraRewards", 10f);
            UiFactory.Place(extra.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -398f), new Vector2(-30f, -350f));
            _extraRewards = extra.gameObject;
            _reputation = Reward(extra, "Reputation", UiFactory.Medal, UiFactory.ReputationColor, out _reputationIcon);
            _extraGap = UiFactory.Go(extra, "Gap");
            var gapElement = _extraGap.AddComponent<LayoutElement>();
            gapElement.minWidth = 36f;
            gapElement.preferredWidth = 36f;
            _materials = Reward(extra, "Materials", UiFactory.Crate, UiFactory.MaterialsColor, out _materialsIcon);
            _reputationImage = _reputationIcon.GetComponent<Image>();
            _materialsImage = _materialsIcon.GetComponent<Image>();

            var divider = UiFactory.Go(card, "Divider").AddComponent<Image>();
            divider.color = UiFactory.PanelLight;
            divider.raycastTarget = false;
            UiFactory.Place(divider.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(50f, -418f), new Vector2(-50f, -416f));

            _wentWell = Column(card, "WentWell", "What went well", WentWellColor, 0f, 0.5f, 50f, -20f);
            _improve = Column(card, "NeedsImprovement", "Needs improvement", UiFactory.Recovering, 0.5f, 1f, 20f, -50f);

            _leaving = UiFactory.Label(card, "Leaving", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter, FontStyle.Italic);
            UiFactory.Place(_leaving.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -642f), new Vector2(-40f, -608f));

            // Waves never run out (P10), so S4 always leads on to the next one.
            var claim = UiFactory.TextButton(card, "Claim", "CLAIM REWARDS", 34, UiFactory.Cta, UiFactory.Cream, OnClaim);
            UiFactory.PlaceFixed(claim.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(420f, 96f));

            _root.SetActive(false);
        }

        static Text Reward(Transform row, string name, Sprite icon, Color iconColor)
            => Reward(row, name, icon, iconColor, out _);

        static Text Reward(Transform row, string name, Sprite icon, Color iconColor, out GameObject iconGo)
        {
            iconGo = UiFactory.RowIcon(row, name + "Icon", icon, iconColor, 34f).gameObject;
            return UiFactory.Label(row, name, "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
        }

        // Card layout, top down: rewards rows end at 398, divider at 416, columns 438-588, leaving line
        // 608-642, claim button from 690 (820 - 34 - 96) — no overlaps.
        static Text Column(Transform card, string name, string header, Color headerColor, float aMin, float aMax,
            float left, float right)
        {
            var head = UiFactory.Label(card, name + "Header", header, 24, headerColor, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(head.gameObject, new Vector2(aMin, 1f), new Vector2(aMax, 1f), new Vector2(left, -472f), new Vector2(right, -438f));
            var body = UiFactory.Label(card, name, "", 24, UiFactory.Cream, TextAnchor.UpperLeft);
            UiFactory.Place(body.gameObject, new Vector2(aMin, 1f), new Vector2(aMax, 1f), new Vector2(left, -588f), new Vector2(right, -480f));
            body.horizontalOverflow = HorizontalWrapMode.Wrap;
            return body;
        }

        // Wave style: Coins · Energy · Resort Value, then Reputation · Materials (only when earned).
        void ApplyWaveStyle()
        {
            _vipMode = false;
            _card.color = UiFactory.Panel;
            _title.color = UiFactory.Cream;
            SetIcon(_coinsIcon, UiFactory.Circle, UiFactory.Gold);
            SetIcon(_energyIcon, UiFactory.Bolt, UiFactory.Recovering);
            SetIcon(_valueIcon, UiFactory.Star, UiFactory.Gold);
            SetIcon(_reputationImage, UiFactory.Medal, UiFactory.ReputationColor);
            SetIcon(_materialsImage, UiFactory.Crate, UiFactory.MaterialsColor);
        }

        static void SetIcon(Image icon, Sprite sprite, Color color)
        {
            icon.sprite = sprite;
            icon.color = color;
        }

        // S8: Reputation first, then Coins, Energy, Materials, Resort Value (UI S8). The sim already
        // applied the rewards when the stay finished; CLAIM REWARDS only closes and clears the visit.
        public void ShowVip(VipVisit visit)
        {
            var res = visit?.Result;
            if (res == null) return;
            ApplyWaveStyle();
            _vipMode = true;
            _root.SetActive(true);
            _card.color = VipStyle.PanelDark;
            _title.color = VipStyle.AccentLight;
            _title.text = visit.GuestName + "'s stay is complete";
            for (int i = 0; i < _stars.Length; i++)
                _stars[i].color = i < res.Stars ? UiFactory.Gold : StarEmpty;
            int percent = Mathf.FloorToInt(res.Satisfaction * 100f + 0.001f);
            _satisfaction.text = "Guest satisfaction: " + percent + "%" + (res.Perfect ? " — Perfect stay!" : "");

            int mains = VipStyle.MainCount(visit);
            int mainDone = VipStyle.MainDone(visit);
            _served.text = "Requests completed " + mainDone + "/" + mains + (res.BonusCompleted ? " (+ bonus)" : "");

            SetIcon(_coinsIcon, UiFactory.Medal, UiFactory.ReputationColor);
            _coins.text = "+" + UiFactory.Num(res.ReputationEarned) + " Reputation";
            SetIcon(_energyIcon, UiFactory.Circle, UiFactory.Gold);
            _energy.text = "+" + UiFactory.Num(res.CoinsEarned) + " Coins";
            SetIcon(_valueIcon, UiFactory.Bolt, UiFactory.Recovering);
            _value.text = "+" + res.EnergyEarned + " Energy";

            _extraRewards.SetActive(true);
            _reputationIcon.SetActive(true);
            _reputation.gameObject.SetActive(true);
            SetIcon(_reputationImage, UiFactory.Crate, UiFactory.MaterialsColor);
            _reputation.text = "+" + res.MaterialsEarned + " Materials";
            _extraGap.SetActive(true);
            _materialsIcon.SetActive(true);
            _materials.gameObject.SetActive(true);
            SetIcon(_materialsImage, UiFactory.Star, UiFactory.Gold);
            _materials.text = "+" + res.ResortValueGain + " Resort Value";

            var good = new List<string>();
            var capped = new List<string>();
            foreach (var r in visit.Requests)
            {
                if (r.State == RequestState.Completed && !r.ServedMissing && r.Readiness == Readiness.Good) good.Add(r.Title);
                else if (r.ServedMissing) capped.Add(r.Title + ": missing " + r.MaterialsLabel);
                else if (r.Readiness == Readiness.Risky) capped.Add(r.Title + ": no " + r.RosterGap);
            }
            _wentWell.text = good.Count > 0 ? string.Join("\n", good) : "The guest was looked after in the end.";
            _improve.text = capped.Count > 0 ? string.Join("\n", capped) : "Every request was fully prepared.";
            _leaving.text = string.IsNullOrEmpty(res.DecorUnlocked)
                ? (res.Perfect ? "Perfect stay bonus earned." : "")
                : "New decor: " + VipCatalog.DecorDisplayName(res.DecorUnlocked) + " — now on your island";
        }

        public void Show(WaveResult result)
        {
            ApplyWaveStyle();
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

            bool reputation = result.ReputationEarned > 0;
            bool materials = result.MaterialsEarned > 0;
            _extraRewards.SetActive(reputation || materials);
            _reputationIcon.SetActive(reputation);
            _reputation.gameObject.SetActive(reputation);
            _reputation.text = "+" + UiFactory.Num(result.ReputationEarned) + " Reputation";
            _materialsIcon.SetActive(materials);
            _materials.gameObject.SetActive(materials);
            _materials.text = "+" + UiFactory.Num(result.MaterialsEarned) + " Materials";
            _extraGap.SetActive(reputation && materials);

            _wentWell.text = WentWell(result, _game.Tuning.PatienceGraceSeconds);
            _improve.text = NeedsImprovement(result);
            _leaving.text = LeavingLine(result.Stars);
        }

        void OnClaim()
        {
            _root.SetActive(false);
            if (_vipMode)
            {
                _vipMode = false;
                _onVipClaim?.Invoke();
                return;
            }
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
