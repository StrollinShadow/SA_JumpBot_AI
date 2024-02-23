let score = 0;
let gameInterval;
let obstacleCreationInterval;
let isGameOver = true;
let sendInterval;

const socket = new WebSocket("ws://localhost:6789");

socket.onopen = function (e) {
  console.log("Connection to AI server established");
};

socket.onmessage = function (event) {
  const aiAction = JSON.parse(event.data).action;
  performAIAction(aiAction);
};

socket.onerror = function (error) {
  console.log(`WebSocket Error: ${error}`);
};

function startGame() {
  if (!isGameOver) {
    return;
  }

  isGameOver = false;
  score = 0;
  document.getElementById("score").textContent = score;
  document.getElementById("game-over-screen").style.display = "none";

  document
    .querySelectorAll(".obstacle")
    .forEach((obstacle) => obstacle.remove());

  // Create the first obstacle in the middle of the game container
  createObstacle(true);

  gameInterval = setInterval(updateScore, 10);
  sendInterval = setInterval(sendGameState, 200);
  obstacleCreationInterval = setInterval(createObstacle, 1800); // Subsequent obstacles will not spawn in the middle
  console.log("StartGame");
}

function restartGame() {
  clearInterval(gameInterval);
  clearInterval(obstacleCreationInterval);
  startGame();
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ status: "restart" }));
  }
  console.log("restartGame");
}

document.addEventListener("keydown", function (event) {
  if (
    event.code === "Space" ||
    event.code === "KeyW" ||
    event.code === "ArrowUp"
  ) {
    if (isGameOver) {
      restartGame();
    } else {
      jump();
    }
  } else if (event.code === "KeyS" || event.code === "ArrowDown") {
    crouch();
  }
});

function jump() {
  let player = document.getElementById("player");
  if (!player.classList.contains("jump")) {
    player.classList.add("jump");

    setTimeout(function () {
      player.classList.remove("jump");
    }, 800);
  }
}

function crouch() {
  let player = document.getElementById("player");
  if (!player.classList.contains("crouch")) {
    player.classList.add("crouch");

    setTimeout(function () {
      player.classList.remove("crouch");
    }, 800); // Adjust the timeout as needed
  }
}

let gameContainer = document.getElementById("game-container");
let player = document.getElementById("player");

function createObstacle(spawnMiddle = false) {
  if (spawnMiddle) {
    let positions = [0.1 / 6, 2 / 6, 4 / 6]; // Use your adjusted positions here
    positions.forEach((position) => {
      let obstacle = document.createElement("div");
      obstacle.classList.add("obstacle");

      // Randomly assign obstacle type for each obstacle
      let obstacleType = Math.floor(Math.random() * 3);
      switch (obstacleType) {
        case 0: // Normal obstacle, no additional class needed
          break;
        case 1:
          obstacle.classList.add("flying");
          break;
      }

      gameContainer.appendChild(obstacle);
      let gameContainerWidth = gameContainer.offsetWidth;
      // Adjust the right position to account for the obstacle's width
      obstacle.style.right =
        gameContainerWidth * position - obstacle.offsetWidth / 2 + "px";
      moveObstacle(obstacle);
    });
  } else {
    // Original single obstacle creation logic
    obstacle = document.createElement("div");
    obstacle.classList.add("obstacle");

    // Randomly assign obstacle type
    let obstacleType = Math.floor(Math.random() * 2);
    switch (obstacleType) {
      case 0: // Normal obstacle, no additional class needed
        break;
      case 1:
        obstacle.classList.add("flying");
        break;
    }

    gameContainer.appendChild(obstacle);
    moveObstacle(obstacle);
  }
}

function moveObstacle(obstacle) {
  let obstacleInterval = setInterval(function () {
    if (isGameOver) {
      clearInterval(obstacleInterval);
      obstacle.remove();
    } else {
      let obstacleRight = parseInt(
        window.getComputedStyle(obstacle).getPropertyValue("right")
      );
      let gameContainerWidth = gameContainer.offsetWidth;
      let playerRect = player.getBoundingClientRect();
      let obstacleRect = obstacle.getBoundingClientRect();

      if (
        obstacleRect.left <= playerRect.right &&
        obstacleRect.right >= playerRect.left &&
        obstacleRect.top <= playerRect.bottom &&
        obstacleRect.bottom >= playerRect.top
      ) {
        gameOver();
      }

      if (obstacleRight > gameContainerWidth) {
        obstacle.remove();
        clearInterval(obstacleInterval);
      } else {
        obstacle.style.right = obstacleRight + score / 8000 + 8 + "px";
      }
    }
  }, 20);
}

function performAIAction(action) {
  if (action === "jump") {
    if (isGameOver) {
      restartGame();
    } else {
      jump();
    }
  } else if (action === "crouch" && !isGameOver) {
    crouch();
  }
}

function gameOver() {
  clearInterval(gameInterval);
  clearInterval(sendInterval);
  clearInterval(obstacleCreationInterval);
  isGameOver = true;
  document.getElementById("game-over-screen").style.display = "block";
  socket.send(JSON.stringify({ status: "game_over" }));
}

function getPlayerPosition() {
  const playerElement = document.getElementById("player");
  const rect = playerElement.getBoundingClientRect();
  const gameContainerRect = document
    .getElementById("game-container")
    .getBoundingClientRect();

  return {
    bottom: gameContainerRect.bottom - rect.bottom,
    right: gameContainerRect.right - rect.right,
  };
}

function getObstaclesData() {
  const obstacles = document.querySelectorAll(".obstacle");
  const gameContainerRect = document
    .getElementById("game-container")
    .getBoundingClientRect();

  return Array.from(obstacles)
    .map((obstacle) => {
      if (document.body.contains(obstacle)) {
        // Ensure the obstacle is still in the DOM
        const rect = obstacle.getBoundingClientRect();
        return {
          right: gameContainerRect.right - rect.right,
          bottom: gameContainerRect.bottom - rect.bottom,
          type: obstacle.classList.contains("flying")
            ? "flying"
            : obstacle.classList.contains("higher")
            ? "higher"
            : "normal",
        };
      }
      return null; // Return null for obstacles no longer in the DOM
    })
    .filter((obstacleData) => obstacleData !== null); // Filter out null values
}

function updateScore() {
  if (!isGameOver) {
    score += 1;
    document.getElementById("score").textContent = score;
  }
}

function sendGameState() {
  const gameState = {
    playerPosition: getPlayerPosition(),
    obstacles: getObstaclesData(),
    score: score,
  };

  // Validate gameState before sending
  if (gameState.playerPosition && gameState.obstacles !== undefined) {
    socket.send(JSON.stringify(gameState));
  }
}

document.getElementById("game-over-screen").style.display = "none";

startGame();
