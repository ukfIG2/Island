using System;
using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S7 Guest Request Board — VIP only, a right-side panel so the island stays visible. Solved by
    // preparedness (Fix with Materials, roster caps, optional Energy), never by assigning staff: the
    // board never opens the worker sheet. During a wave it shares the right side with the wave panel
    // (tab), and the wave keeps running.
    public sealed class VipBoardUi
    {
        sealed class Card
        {
            public GameObject Root;
            public Image Bg;
            public Text Title;
            public Text Flavor;
            public Text Badge;
            public Image BadgeBg;
            public Text Info1;
            public Text Info2;
            public ActionSlot Action;
            public VipRequest Request;
        }

        const float Width = 540f;
        const float DesignHeight = 940f;
        const float CardHeight = 142f;
        const float CardStep = 148f;
        const float CardsTop = 178f;
        const int MaxCards = 4;
        const float BarWidth = 500f;

        static readonly Color CardColor = new Color(0f, 0f, 0f, 0.25f);
        static readonly Color BonusCardColor = new Color(0.61f, 0.48f, 0.88f, 0.22f);

        readonly GameController _game;
        readonly Action _onBack;
        readonly RectTransform _rect;
        readonly Image _portrait;
        readonly Text _initial;
        readonly Text _title;
        readonly Text _subtitle;
        readonly Text _backLabel;
        readonly Image[] _stars = new Image[5];
        readonly Text _perfect;
        readonly BarWidget _bar;
        readonly Card[] _cards = new Card[MaxCards];
        readonly Text _reputation;
        readonly Text _coins;
        readonly Text _energy;
        readonly Text _materials;
        readonly Text _value;
        readonly Text _rewardsHeader;
        readonly Button _serve;
        readonly Text _note;
        readonly Text _progress;
        bool _duringWave;

        public GameObject Root => _rect.gameObject;
        public bool Visible => _rect.gameObject.activeSelf;

        public VipBoardUi(Transform canvas, GameController game, Action onBack)
        {
            _game = game;
            _onBack = onBack;
            var panel = UiFactory.PanelImage(canvas, "VipBoard", UiFactory.Panel);
            _rect = UiFactory.PlaceFixed(panel.gameObject, Vector2.one, Vector2.one, new Vector2(-12f, -84f), new Vector2(Width, DesignHeight));
            var p = panel.transform;

            // Header 0-64.
            _initial = VipStyle.Portrait(p, "Portrait", 46f, out _portrait);
            UiFactory.PlaceFixed(_portrait.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(14f, -10f), new Vector2(46f, 46f));
            _title = UiFactory.Label(p, "Title", "", 26, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(70f, -38f), new Vector2(-150f, -8f));
            _subtitle = UiFactory.Label(p, "Subtitle", "", 17, VipStyle.AccentLight);
            UiFactory.Place(_subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(70f, -62f), new Vector2(-150f, -38f));
            var back = UiFactory.TextButton(p, "Back", "", 20, UiFactory.PanelLight, UiFactory.Cream, () => _onBack?.Invoke());
            UiFactory.PlaceFixed(back.gameObject, Vector2.one, Vector2.one, new Vector2(-12f, -12f), new Vector2(130f, 44f));
            _backLabel = UiFactory.ButtonLabel(back);

            // Satisfaction 70-168: label + projected stars, bar with the shared thresholds (P2), tick labels.
            var sat = UiFactory.Label(p, "SatisfactionLabel", "Satisfaction", 21, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(sat.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -98f), new Vector2(-20f, -70f));
            for (int i = 0; i < _stars.Length; i++)
            {
                _stars[i] = UiFactory.Icon(p, "Star" + i, UiFactory.Star, UiFactory.Gold);
                UiFactory.PlaceFixed(_stars[i].gameObject, Vector2.one, new Vector2(1f, 0.5f), new Vector2(-20f - (4 - i) * 26f, -84f), new Vector2(24f, 24f));
            }
            _perfect = UiFactory.Label(p, "Perfect", "Perfect", 18, UiFactory.Gold, TextAnchor.MiddleRight, FontStyle.Bold);
            UiFactory.PlaceFixed(_perfect.gameObject, Vector2.one, new Vector2(1f, 0.5f), new Vector2(-156f, -84f), new Vector2(90f, 26f));

            _bar = new BarWidget(p, "SatisfactionBar", new Color(0f, 0f, 0f, 0.35f));
            UiFactory.PlaceFixed(_bar.Root, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(20f, -104f), new Vector2(BarWidth, 22f));
            var thresholds = game.Tuning.RatingThresholds;
            for (int i = 0; i < thresholds.Length; i++)
            {
                float x = Mathf.Clamp01(thresholds[i]);
                var tick = UiFactory.Go(_bar.Root.transform, "Tick" + i).AddComponent<Image>();
                tick.color = UiFactory.Cream;
                tick.raycastTarget = false;
                UiFactory.PlaceFixed(tick.gameObject, new Vector2(x, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(2f, 30f));

                // Two staggered label rows so neighbouring thresholds never overlap.
                bool perfect = RatingScale.IsPerfect(i, game.Tuning);
                var label = UiFactory.Row(p, "TickLabel" + i, 2f, perfect ? TextAnchor.MiddleRight : TextAnchor.MiddleCenter);
                float y = i % 2 == 0 ? -130f : -150f;
                float left = 20f + x * BarWidth - (perfect ? 90f : 45f);
                UiFactory.PlaceFixed(label.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(left, y), new Vector2(90f, 20f));
                if (perfect)
                    UiFactory.Label(label, "Text", "Perfect", 15, UiFactory.CreamDim);
                else
                {
                    UiFactory.Label(label, "Stars", RatingScale.StarsFor(i).ToString(), 15, UiFactory.CreamDim);
                    UiFactory.RowIcon(label, "Star", UiFactory.Star, UiFactory.Gold, 13f);
                    UiFactory.Label(label, "Pct", Mathf.RoundToInt(thresholds[i] * 100f) + "%", 15, UiFactory.CreamDim);
                }
            }

            for (int i = 0; i < MaxCards; i++) _cards[i] = BuildCard(p, i);

            // Bottom zone 772-928: rewards on the left, the one main CTA on the right.
            _rewardsHeader = UiFactory.Label(p, "RewardsHeader", "Rewards", 18, UiFactory.Gold, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.PlaceFixed(_rewardsHeader.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(20f, -772f), new Vector2(260f, 22f));
            _reputation = RewardLine(p, 0, UiFactory.Medal, UiFactory.ReputationColor);
            _coins = RewardLine(p, 1, UiFactory.Circle, UiFactory.Gold);
            _energy = RewardLine(p, 2, UiFactory.Bolt, UiFactory.Recovering);
            _materials = RewardLine(p, 3, UiFactory.Crate, UiFactory.MaterialsColor);
            _value = RewardLine(p, 4, UiFactory.Star, UiFactory.Gold);

            _note = UiFactory.Label(p, "Note", "", 16, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.PlaceFixed(_note.gameObject, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-12f, -776f), new Vector2(236f, 40f));
            _note.horizontalOverflow = HorizontalWrapMode.Wrap;
            _serve = UiFactory.TextButton(p, "ServeAll", "SERVE ALL", 30, UiFactory.Cta, UiFactory.Cream, OnServeAll);
            UiFactory.PlaceFixed(_serve.gameObject, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-12f, -822f), new Vector2(236f, 84f));
            _progress = UiFactory.Label(p, "Progress", "", 20, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.PlaceFixed(_progress.gameObject, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-12f, -800f), new Vector2(236f, 110f));
            _progress.horizontalOverflow = HorizontalWrapMode.Wrap;

            _rect.gameObject.SetActive(false);
        }

        static Text RewardLine(Transform p, int i, Sprite icon, Color color)
        {
            var row = UiFactory.Row(p, "Reward" + i, 6f, TextAnchor.MiddleLeft);
            UiFactory.PlaceFixed(row.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(20f, -796f - i * 26f), new Vector2(270f, 24f));
            UiFactory.RowIcon(row, "Icon", icon, color, 20f);
            return UiFactory.Label(row, "Text", "", 18, UiFactory.Cream);
        }

        // Card 500 x 142: title / badge 8-36, flavor 38-74, info lines 78-100 and 104-126, action bottom right.
        Card BuildCard(Transform p, int i)
        {
            var bg = UiFactory.PanelImage(p, "Request" + i, CardColor);
            bg.raycastTarget = false;
            UiFactory.PlaceFixed(bg.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -CardsTop - i * CardStep), new Vector2(500f, CardHeight));
            var t = bg.transform;
            var c = new Card { Root = bg.gameObject, Bg = bg };
            c.Title = UiFactory.Label(t, "Title", "", 21, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(c.Title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(14f, -36f), new Vector2(-196f, -8f));
            c.Badge = UiFactory.Badge(t, "Badge", 15, UiFactory.Positive, UiFactory.Cream);
            c.BadgeBg = c.Badge.transform.parent.GetComponent<Image>();
            UiFactory.PlaceFixed(c.BadgeBg.gameObject, Vector2.one, Vector2.one, new Vector2(-10f, -8f), new Vector2(176f, 28f));
            c.Flavor = UiFactory.Label(t, "Flavor", "", 15, UiFactory.CreamDim, TextAnchor.UpperLeft);
            UiFactory.Place(c.Flavor.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(14f, -76f), new Vector2(-14f, -40f));
            c.Flavor.horizontalOverflow = HorizontalWrapMode.Wrap;
            c.Info1 = UiFactory.Label(t, "Info1", "", 17, UiFactory.Cream);
            UiFactory.Place(c.Info1.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(14f, -100f), new Vector2(-196f, -78f));
            c.Info2 = UiFactory.Label(t, "Info2", "", 17, UiFactory.Cream);
            UiFactory.Place(c.Info2.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(14f, -126f), new Vector2(-196f, -104f));
            int index = i;
            c.Action = new ActionSlot(t, "Action", 18, UiFactory.Positive, () => OnAction(index));
            UiFactory.PlaceFixed(c.Action.Root.gameObject, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-10f, 10f), new Vector2(180f, 46f));
            return c;
        }

        public void Show(bool duringWave)
        {
            if (_game.ActiveVip == null) return;
            _duringWave = duringWave;
            _rect.gameObject.SetActive(true);
            Refresh();
        }

        public void Hide() => _rect.gameObject.SetActive(false);

        public void Refresh()
        {
            if (!Visible) return;
            var v = _game.ActiveVip;
            if (v == null)
            {
                Hide();
                return;
            }
            FitToCanvas();
            var t = _game.Tuning;
            _portrait.color = VipStyle.PortraitColor(v.Type);
            _initial.text = VipStyle.Initial(v);
            _title.text = v.GuestName + "'s requests";
            _subtitle.text = "VIP · " + VipCatalog.DisplayName(v.Type);
            _backLabel.text = _duringWave ? "Wave " + _game.NextWaveIndex : "Close";

            // Projected rating as prepared right now — a bar and stars, never a live number.
            float q = v.ProjectedQuality;
            int tier = RatingScale.TierFor(q, t);
            int stars = RatingScale.StarsFor(tier);
            for (int i = 0; i < _stars.Length; i++)
                _stars[i].color = i < stars ? UiFactory.Gold : new Color(1f, 1f, 1f, 0.18f);
            _perfect.gameObject.SetActive(RatingScale.IsPerfect(tier, t));
            _bar.SetFill(q, stars >= 4 ? UiFactory.Positive : UiFactory.Gold);

            var requests = v.Requests;
            for (int i = 0; i < _cards.Length; i++)
            {
                var c = _cards[i];
                c.Root.SetActive(i < requests.Count);
                if (i < requests.Count) RefreshCard(c, requests[i], v);
            }
            RefreshRewards(v);
            RefreshCta(v);
        }

        void FitToCanvas()
        {
            var canvas = _rect.parent as RectTransform;
            if (canvas == null) return;
            float available = canvas.rect.height - 84f - 12f;
            float s = available > 0f ? Mathf.Min(1f, available / DesignHeight) : 1f;
            _rect.localScale = new Vector3(s, s, 1f);
        }

        void RefreshCard(Card c, VipRequest r, VipVisit v)
        {
            var t = _game.Tuning;
            var resort = _game.Resort;
            c.Request = r;
            c.Bg.color = r.IsBonus ? BonusCardColor : CardColor;
            c.Title.text = (r.IsBonus ? "Bonus · " : "") + r.Title;
            c.Flavor.text = r.Flavor;

            switch (r.State)
            {
                case RequestState.Missing:
                    if (v.Served) SetBadge(c, "SKIPPED", UiFactory.PanelShade, UiFactory.CreamDim);
                    else SetBadge(c, "MISSING", UiFactory.Recovering, UiFactory.Panel);
                    break;
                case RequestState.Ready:
                    SetBadge(c, "READY", UiFactory.Positive, UiFactory.Cream);
                    break;
                case RequestState.InProgress:
                    SetBadge(c, "IN PROGRESS " + VipStyle.Clock(r.Remaining), UiFactory.Neutral, UiFactory.Panel);
                    break;
                default:
                    SetBadge(c, "COMPLETED", UiFactory.Gold, UiFactory.Panel);
                    break;
            }

            // Info line 1: the consumable layer (Materials).
            if (r.MaterialsNeeded <= 0) c.Info1.text = "";
            else if (r.State == RequestState.Missing)
            {
                c.Info1.text = (v.Served ? "Not served: " : "Missing: ") + r.MaterialsLabel;
                c.Info1.color = UiFactory.Recovering;
            }
            else
            {
                c.Info1.text = r.ServedMissing ? "Served without " + r.MaterialsLabel : r.MaterialsLabel + " in place";
                c.Info1.color = r.ServedMissing ? UiFactory.CreamDim : UiFactory.Positive;
            }

            // Info line 2: the roster layer — a cap, never a block (no Fix button for it).
            if (r.Readiness == Readiness.Risky)
            {
                c.Info2.text = "max " + VipStyle.CapStars(r.QualityCap, t) + " stars — no " + r.RosterGap
                               + (r.QualityBoosted ? " (boosted)" : "");
                c.Info2.color = UiFactory.Recovering;
            }
            else if (r.IsBonus)
            {
                c.Info2.text = "Optional · +" + Mathf.RoundToInt(t.VipBonusSatisfaction * 100f) + "% satisfaction";
                c.Info2.color = VipStyle.AccentLight;
            }
            else if (r.HasRosterRequirement)
            {
                c.Info2.text = r.RosterLabel + " ready";
                c.Info2.color = UiFactory.Positive;
            }
            else c.Info2.text = "";

            // One action per card: Fix (Materials), Quality boost (Mode B), Speed Up (Mode A) or a test ad.
            if (r.State == RequestState.Missing && !v.Served)
            {
                if (v.CanFix(r)) c.Action.ShowButton("Fix · " + r.MaterialsNeeded + " Materials");
                else c.Action.ShowChip("<size=15>Not enough Materials</size>");
                c.Action.SetButtonColor(UiFactory.Positive);
            }
            else if (r.State == RequestState.Ready && !v.Served && !r.QualityBoosted && r.QualityCap < 1f - 1e-6f)
            {
                if (v.CanQualityBoost(r)) c.Action.ShowButton("Quality boost · " + t.EnergyBoostCost + " Energy");
                else c.Action.ShowButton(NeedsPanelUi.TestAdLabel(_game, 14));
                c.Action.SetButtonColor(UiFactory.Recovering);
            }
            else if (r.State == RequestState.InProgress && !r.SpedUp)
            {
                if (v.CanSpeedUp(r)) c.Action.ShowButton("Speed Up · " + t.EnergyBoostCost + " Energy");
                else c.Action.ShowButton(NeedsPanelUi.TestAdLabel(_game, 14));
                c.Action.SetButtonColor(UiFactory.Recovering);
            }
            else c.Action.Hide();
        }

        static void SetBadge(Card c, string text, Color bg, Color fg)
        {
            c.Badge.text = text;
            c.Badge.color = fg;
            c.BadgeBg.color = bg;
        }

        // Reputation first, then Coins, Energy, Materials, Resort Value (UI S8 order).
        void RefreshRewards(VipVisit v)
        {
            if (v.Result != null)
            {
                var res = v.Result;
                _rewardsHeader.text = "Rewards";
                _reputation.text = "+" + res.ReputationEarned + " Reputation";
                _coins.text = "+" + UiFactory.Num(res.CoinsEarned) + " Coins";
                _energy.text = "+" + res.EnergyEarned + " Energy";
                _materials.text = "+" + res.MaterialsEarned + " Materials";
                _value.text = "+" + res.ResortValueGain + " Resort Value";
                return;
            }
            var range = v.RewardRange;
            _rewardsHeader.text = "Rewards as prepared now";
            _reputation.text = "+" + range.MinReputation + " Reputation";
            _coins.text = "+" + UiFactory.Num(range.MinCoins) + " Coins";
            _energy.text = "+" + range.MinEnergy + " Energy";
            _materials.text = "+" + range.MinMaterials + " Materials";
            _value.text = "+" + v.ProjectedStars * _game.Tuning.VipResortValuePerStar + " Resort Value";
        }

        void RefreshCta(VipVisit v)
        {
            bool canServe = v.Accepted && !v.Served;
            _serve.gameObject.SetActive(canServe);
            _note.gameObject.SetActive(canServe);
            _progress.gameObject.SetActive(!canServe);
            if (canServe)
            {
                bool missing = false;
                foreach (var r in v.Requests) missing |= !r.IsBonus && r.State == RequestState.Missing;
                _note.text = missing ? "Missing items lower the rating" : "Everything is prepared";
                return;
            }
            if (v.Result != null)
            {
                _progress.text = _duringWave ? "Stay complete\n<size=16>Results after this wave</size>" : "Stay complete";
                return;
            }
            float longest = 0f;
            foreach (var r in v.Requests)
                if (r.State == RequestState.InProgress) longest = Mathf.Max(longest, r.Remaining);
            _progress.text = VipStyle.MainDone(v) + " of " + VipStyle.MainCount(v) + " requests done\n<size=16>All done in "
                             + VipStyle.Clock(longest) + "</size>";
        }

        void OnServeAll()
        {
            _game.ServeAllVip();
            Refresh();
        }

        void OnAction(int index)
        {
            var c = _cards[index];
            var v = _game.ActiveVip;
            var r = c.Request;
            if (v == null || r == null) return;
            if (r.State == RequestState.Missing && !v.Served) _game.FixRequest(r);
            else if (r.State == RequestState.Ready && !v.Served)
            {
                if (v.CanQualityBoost(r)) _game.QualityBoostRequest(r);
                else _game.WatchTestAd();
            }
            else if (r.State == RequestState.InProgress)
            {
                if (v.CanSpeedUp(r)) _game.SpeedUpRequest(r);
                else _game.WatchTestAd();
            }
            Refresh();
        }
    }
}
