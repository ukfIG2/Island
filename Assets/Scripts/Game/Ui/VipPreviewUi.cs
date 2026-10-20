using System;
using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Shared look of the VIP layer (S6-S8): lilac accent, portrait placeholder, small text helpers.
    public static class VipStyle
    {
        public static readonly Color Accent = UiFactory.Hex(0x9B7BE0);
        public static readonly Color AccentLight = UiFactory.Hex(0xC9B3F5);
        public static readonly Color PanelDark = UiFactory.Hex(0x2E2650);

        public static Color PortraitColor(VipType type)
        {
            switch (type)
            {
                case VipType.TravelBlogger: return UiFactory.Hex(0x4FB3A9);
                case VipType.WeddingCouple: return UiFactory.Hex(0xE58FB0);
                case VipType.Investor: return UiFactory.Hex(0x5B7FD4);
                default: return UiFactory.Hex(0xB07BE0);
            }
        }

        // A colored circle with the guest's initial — placeholder until portraits exist.
        public static Text Portrait(Transform parent, string name, float size, out Image circle)
        {
            circle = UiFactory.Dot(parent, name, Accent);
            var initial = UiFactory.Label(circle.transform, "Initial", "", Mathf.RoundToInt(size * 0.5f), UiFactory.Cream,
                TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(initial.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return initial;
        }

        public static string Initial(VipVisit v) => string.IsNullOrEmpty(v.GuestName) ? "?" : v.GuestName.Substring(0, 1);

        // Stars of a quality cap on the shared rating scale (P2).
        public static int CapStars(float cap, TuningConfig t) => RatingScale.StarsFor(RatingScale.TierFor(cap, t));

        public static string Range(int min, int max) => min == max ? "+" + UiFactory.Num(max) : "+" + UiFactory.Num(min) + "–" + UiFactory.Num(max);

        public static string Clock(float seconds)
        {
            int s = Mathf.Max(0, Mathf.CeilToInt(seconds));
            return (s / 60) + ":" + (s % 60).ToString("00");
        }

        public static int MainCount(VipVisit v)
        {
            int n = 0;
            foreach (var r in v.Requests) if (!r.IsBonus) n++;
            return n;
        }

        public static int MainDone(VipVisit v)
        {
            int n = 0;
            foreach (var r in v.Requests) if (!r.IsBonus && r.State == RequestState.Completed) n++;
            return n;
        }

        public static int MainReady(VipVisit v)
        {
            int n = 0;
            foreach (var r in v.Requests) if (!r.IsBonus && r.State != RequestState.Missing) n++;
            return n;
        }

        // Derived in the game layer (the sim has no difficulty member): how far the resort is from a
        // Perfect stay as prepared right now.
        public static string Difficulty(VipVisit v, TuningConfig t)
        {
            int stars = v.ProjectedStars;
            if (stars >= 5) return "Relaxed";
            if (stars >= 4) return "Moderate";
            return "Demanding";
        }
    }

    // S6 VIP Preview / Accept card: who is coming, what they will ask for, how ready the resort is for
    // each request (roster gaps visible BEFORE accepting), and the reward range. Accepting is always
    // possible; "Maybe later" keeps the offer, "Decline" is never punished.
    public sealed class VipPreviewUi
    {
        sealed class RequestRow
        {
            public GameObject Root;
            public Text Title;
            public Text Detail;
            public Text Tag;
            public Image TagBg;
        }

        const int MaxRows = 4;

        readonly GameController _game;
        readonly Action _onAccepted;
        readonly Action _onClosed;
        readonly GameObject _root;
        readonly Image _portrait;
        readonly Text _initial;
        readonly Text _name;
        readonly Text _type;
        readonly Text _difficulty;
        readonly RequestRow[] _rows = new RequestRow[MaxRows];
        readonly Text _reputation;
        readonly Text _coins;
        readonly Text _energy;
        readonly Text _materials;
        readonly Text _decor;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public VipPreviewUi(Transform canvas, GameController game, Action onAccepted, Action onClosed)
        {
            _game = game;
            _onAccepted = onAccepted;
            _onClosed = onClosed;
            _root = UiFactory.Overlay(canvas, "VipPreview", new Color(0f, 0f, 0f, 0.5f)).gameObject;

            // Card 1000 x 840: header 28-168, requests 184-460, rewards 476-560, decor 566-596,
            // OPEN REQUESTS 616-712, Maybe later / Decline 732-800.
            var card = UiFactory.PanelImage(_root.transform, "Card", VipStyle.PanelDark).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -30f), new Vector2(1000f, 840f));

            _initial = VipStyle.Portrait(card, "Portrait", 120f, out _portrait);
            UiFactory.PlaceFixed(_portrait.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(40f, -32f), new Vector2(120f, 120f));

            var header = UiFactory.Label(card, "Header", "VIP guest", 22, VipStyle.AccentLight, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(header.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(190f, -60f), new Vector2(-30f, -30f));
            _name = UiFactory.Label(card, "Name", "", 42, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_name.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(190f, -110f), new Vector2(-30f, -60f));
            _type = UiFactory.Label(card, "Type", "", 24, UiFactory.CreamDim);
            UiFactory.Place(_type.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(190f, -142f), new Vector2(-30f, -112f));
            _difficulty = UiFactory.Label(card, "Difficulty", "", 22, UiFactory.Cream, TextAnchor.MiddleRight);
            UiFactory.Place(_difficulty.gameObject, new Vector2(0.5f, 1f), Vector2.one, new Vector2(0f, -142f), new Vector2(-30f, -112f));

            var reqHeader = UiFactory.Label(card, "RequestsHeader", "Requests", 24, UiFactory.Gold, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(reqHeader.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -208f), new Vector2(-40f, -180f));
            for (int i = 0; i < MaxRows; i++) _rows[i] = BuildRow(card, i);

            var rewardHeader = UiFactory.Label(card, "RewardsHeader", "Possible rewards", 22, UiFactory.Gold, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(rewardHeader.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -504f), new Vector2(-40f, -476f));
            var rewards = UiFactory.Row(card, "Rewards", 8f);
            UiFactory.Place(rewards.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -556f), new Vector2(-40f, -510f));
            _reputation = Reward(rewards, "Reputation", UiFactory.Medal, UiFactory.ReputationColor);
            UiFactory.RowGap(rewards, 22f);
            _coins = Reward(rewards, "Coins", UiFactory.Circle, UiFactory.Gold);
            UiFactory.RowGap(rewards, 22f);
            _energy = Reward(rewards, "Energy", UiFactory.Bolt, UiFactory.Recovering);
            UiFactory.RowGap(rewards, 22f);
            _materials = Reward(rewards, "Materials", UiFactory.Crate, UiFactory.MaterialsColor);

            _decor = UiFactory.Label(card, "Decor", "", 20, UiFactory.CreamDim, TextAnchor.MiddleCenter, FontStyle.Italic);
            UiFactory.Place(_decor.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -596f), new Vector2(-40f, -566f));

            var open = UiFactory.TextButton(card, "OpenRequests", "OPEN REQUESTS", 34, UiFactory.Cta, UiFactory.Cream, OnAccept);
            UiFactory.PlaceFixed(open.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 128f), new Vector2(460f, 96f));
            var later = UiFactory.TextButton(card, "MaybeLater", "Maybe later", 26, UiFactory.PanelLight, UiFactory.Cream, OnLater);
            UiFactory.PlaceFixed(later.gameObject, new Vector2(0.5f, 0f), new Vector2(1f, 0f), new Vector2(-10f, 40f), new Vector2(260f, 68f));
            var decline = UiFactory.TextButton(card, "Decline", "Decline", 26, UiFactory.PanelShade, UiFactory.CreamDim, OnDecline);
            UiFactory.PlaceFixed(decline.gameObject, new Vector2(0.5f, 0f), new Vector2(0f, 0f), new Vector2(10f, 40f), new Vector2(260f, 68f));

            _root.SetActive(false);
        }

        static Text Reward(Transform row, string name, Sprite icon, Color color)
        {
            UiFactory.RowIcon(row, name + "Icon", icon, color, 30f);
            return UiFactory.Label(row, name, "", 24, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
        }

        // Row 920 x 62 every 66 px from 214: title + detail on the left, a Good / Risky tag on the right.
        static RequestRow BuildRow(Transform card, int i)
        {
            var bg = UiFactory.PanelImage(card, "Request" + i, new Color(0f, 0f, 0f, 0.22f));
            bg.raycastTarget = false;
            UiFactory.PlaceFixed(bg.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -214f - i * 66f), new Vector2(920f, 62f));
            var t = bg.transform;
            var row = new RequestRow { Root = bg.gameObject };
            row.Title = UiFactory.Label(t, "Title", "", 22, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(row.Title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(18f, -32f), new Vector2(-220f, -4f));
            row.Detail = UiFactory.Label(t, "Detail", "", 18, UiFactory.CreamDim);
            UiFactory.Place(row.Detail.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(18f, -58f), new Vector2(-220f, -32f));
            row.Tag = UiFactory.Badge(t, "Tag", 20, UiFactory.Positive, UiFactory.Cream);
            row.TagBg = row.Tag.transform.parent.GetComponent<Image>();
            UiFactory.PlaceFixed(row.TagBg.gameObject, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-12f, 0f), new Vector2(196f, 44f));
            return row;
        }

        public void Show()
        {
            if (_game.VipOffer == null) return;
            _root.SetActive(true);
            Refresh();
        }

        public void Hide() => _root.SetActive(false);

        public void Refresh()
        {
            if (!Visible) return;
            var v = _game.VipOffer;
            if (v == null)
            {
                Close();
                return;
            }
            var t = _game.Tuning;
            _portrait.color = VipStyle.PortraitColor(v.Type);
            _initial.text = VipStyle.Initial(v);
            _name.text = v.GuestName;
            _type.text = VipCatalog.DisplayName(v.Type) + " · no rush, the offer waits for you";
            _difficulty.text = "Difficulty: " + VipStyle.Difficulty(v, t);

            var requests = v.Requests; // readiness is live until accepted
            for (int i = 0; i < _rows.Length; i++)
            {
                var row = _rows[i];
                row.Root.SetActive(i < requests.Count);
                if (i >= requests.Count) continue;
                var r = requests[i];
                row.Title.text = (r.IsBonus ? "Bonus · " : "") + r.Title;
                row.Detail.text = Detail(r, t);
                bool risky = r.Readiness == Readiness.Risky;
                row.TagBg.color = risky ? UiFactory.Recovering : UiFactory.Positive;
                row.Tag.color = risky ? UiFactory.Panel : UiFactory.Cream;
                row.Tag.text = risky ? "Risky · max " + VipStyle.CapStars(r.QualityCap, t) + " stars" : "Good";
            }

            var range = v.RewardRange;
            _reputation.text = VipStyle.Range(range.MinReputation, range.MaxReputation) + " Reputation";
            _coins.text = VipStyle.Range(range.MinCoins, range.MaxCoins) + " Coins";
            _energy.text = VipStyle.Range(range.MinEnergy, range.MaxEnergy) + " Energy";
            _materials.text = VipStyle.Range(range.MinMaterials, range.MaxMaterials) + " Materials";

            bool owned = false;
            foreach (var d in _game.Resort.Decor) if (d == v.DecorId) owned = true;
            _decor.text = owned ? "" : "A Perfect stay also unlocks new decor: " + VipCatalog.DecorDisplayName(v.DecorId);
        }

        // "Risky — no Spa yet: max 3 stars", "Needs 2x Mangoes (2 Materials)", "Chef on staff".
        string Detail(VipRequest r, TuningConfig t)
        {
            var parts = new List<string>();
            if (r.Readiness == Readiness.Risky)
                parts.Add("No " + r.RosterGap + " yet: max " + VipStyle.CapStars(r.QualityCap, t) + " stars");
            else if (r.HasRosterRequirement)
                parts.Add(r.RosterLabel + " ready");
            if (r.MaterialsNeeded > 0)
            {
                string m = "Needs " + r.MaterialsLabel + " (" + r.MaterialsNeeded + " Materials";
                if (_game.Resort.Materials < r.MaterialsNeeded) m += ", you have " + _game.Resort.Materials;
                parts.Add(m + ")");
            }
            if (parts.Count == 0) parts.Add("Nothing to prepare");
            if (r.IsBonus) parts.Add("optional");
            return string.Join(" · ", parts);
        }

        // The card hides before the controller acts, so the change events never re-enter it.
        void OnAccept()
        {
            _root.SetActive(false);
            if (_game.AcceptVip()) _onAccepted?.Invoke();
            else _onClosed?.Invoke();
        }

        void OnLater()
        {
            _root.SetActive(false);
            _game.MaybeLaterVip();
            _onClosed?.Invoke();
        }

        void OnDecline()
        {
            _root.SetActive(false);
            _game.DeclineVip();
            _onClosed?.Invoke();
        }

        void Close()
        {
            if (!Visible) return;
            _root.SetActive(false);
            _onClosed?.Invoke();
        }
    }
}
