# Teree (Thirteen Court Piece) 🃏🏆

Teree is a high-stakes, real-time multiplayer trick-taking card game played in partnerships (2v2). Combining the bidding depth of Bridge, the unique "Double Sir" collection rule of South Asian card games, and a tense "Tug-of-War" scoring mechanic, Teree offers a highly tactical and competitive experience.

This project implements a web-based, real-time version of the game featuring premium matte-board aesthetics, responsive gameplay, and synchronized multiplayer state management.

---

## 🎮 Game Mechanics & Rules

### 1. Setup & Players
* **Players:** 4 players divided into 2 teams of 2. Partners sit directly opposite each other.
* **Deck:** Standard 52-card deck.
* **Card Rankings:** Ace (Highest) > King > Queen > Jack > 10 > ... > 2 (Lowest).

### 2. Bidding & Trump Selection
* **First Deal:** Each player is dealt exactly 5 cards.
* **The Call:** Starting from the dealer's right, players bid the number of tricks ("Sirs") their team can win out of 13 (minimum bid is 7).
* **Declaring Trump (Rung):** The highest bidder wins the right to declare the Trump suit based on their initial 5 cards.
* **Second Deal:** The remaining 8 cards are distributed to each player (total of 13 cards per player).

### 3. The "Double Sir" Rule (The Heap)
Unlike standard card games where every won trick is immediately collected:
* Cards played to a trick remain in the center of the table in a **Heap**.
* A team only collects the heap if the **same player** wins two consecutive tricks.
* If trick winners alternate, the heap continues to grow. 
* The winner of the final (13th) trick collects whatever remains in the heap.

### 4. Tug-of-War Scoring
* The overall match is tracked on a 52-point scale starting from a neutral center.
* **Winning a Round:** If the bidding team meets/exceeds their bid, they pull the center marker toward their goal by the bid amount.
* **Losing a Round:** If they fail, the opposing team pulls the marker toward their goal by the bid amount.
* The first team to reach a cumulative pull of **52 points** wins the match.

### 5. The "13 Sar" (Grand Slam) Mode
If a player dares to bid all 13 tricks:
* **Open Cards:** The bidder's partner lays all 13 cards face-up.
* **Commander Mode:** The bidder controls both their own and their partner's hands.
* **Sudden Death:** Opponents winning a single trick results in an immediate loss.
* **High Stakes:** Success pulls 13 points; failure penalizes the bidding team by pulling 26 points (Double Penalty) toward the opponent's side.

---

## 🛠️ Technology Stack

* **Frontend:** Modern HTML5, Vanilla CSS (designed with premium tactile and matte board elements), Javascript.
* **Backend:** Node.js, Express.
* **Real-time Sync:** Socket.io for bidirectional, low-latency client-server communication.

---

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation & Run

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/teree-game.git
   cd teree-game
