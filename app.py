import asyncio
import websockets
import json
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense
import numpy as np
import random
from collections import deque
import concurrent.futures
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)

# DQN Agent
class DQN:
    def __init__(self, state_size, action_size):
        self.state_size = state_size
        self.action_size = action_size
        self.memory = deque(maxlen=2000)
        self.gamma = 0.95  # discount rate
        self.epsilon = 1.0  # exploration rate
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.learning_rate = 0.001  # Adjusted according to recommendation
        self.model = self._build_model()

    def _build_model(self):
        model = Sequential()
        model.add(Dense(24, input_dim=self.state_size, activation='relu'))
        model.add(Dense(24, activation='relu'))
        model.add(Dense(self.action_size, activation='linear'))
        model.compile(loss='mse', optimizer=tf.keras.optimizers.Adam(learning_rate=self.learning_rate))
        return model

    def remember(self, state, action, reward, next_state, done):
        self.memory.append((state, action, reward, next_state, done))

    def act(self, state):
        if np.random.rand() <= self.epsilon:
            return random.randrange(self.action_size)
        act_values = self.model.predict(state)
        return np.argmax(act_values[0])

    def replay(self, batch_size):
        if len(self.memory) < batch_size:
            return
        minibatch = random.sample(self.memory, batch_size)
        for state, action, reward, next_state, done in minibatch:
            target = reward
            if not done:
                target = (reward + self.gamma * np.amax(self.model.predict(next_state)[0]))
            target_f = self.model.predict(state)
            target_f[0][action] = target
            self.model.fit(state, target_f, epochs=1, verbose=0)
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def reset(self, new_state_size=None, new_action_size=None):
        if new_state_size is not None:
            self.state_size = new_state_size
        if new_action_size is not None:
            self.action_size = new_action_size

        self.memory.clear()
        self.model = self._build_model()  # Rebuild the model to match new state and action sizes
        self.epsilon = 1.0  # Reset exploration rate 

# Initialize DQN agent
state_size = 5  # Updated state size
action_size = 3  # For jump, crouch, and nothing
agent = DQN(state_size, action_size)



# _______________RESET______________________
# print("Resetting the AI...")
agent.reset(new_state_size=5, new_action_size=3)
# agent.reset()
print("AI has been reset.")



# Parse game state from data


# Asynchronous Training Setup
executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
step_count = 0
TRAINING_INTERVAL = 50  # Adjust based on your requirements

prev_nearest_obstacle_right = None

async def game_handler(websocket, path):
    global step_count, prev_distance_to_first_obstacle, prev_nearest_obstacle_right
    batch_size = 32  # Training batch size
    prev_score = 0  # Previous score for comparison, if needed
    state = None  # Initial state
    action = None  # Initial action
    reward = 0  # Initial reward

    while True:
        try:
            message = await websocket.recv()
            data = json.loads(message)

            # Check for game over status
            if 'status' in data and data['status'] == 'game_over':
                reward = -1  # Penalize for game over
                await asyncio.sleep(5)  # Wait before restarting
                await websocket.send(json.dumps({'action': 'jump'}))  # Send jump action to restart
                prev_score = 0  # Reset previous score
                state = None  # Reset state
                action = None  # Reset action
                agent.epsilon = 1.0  # Reset exploration rate
                prev_distance_to_first_obstacle = float('inf')  # Reset previous obstacle distance
                continue

            # Check if player position and obstacles data are available
            if 'playerPosition' in data and 'obstacles' in data:
                player_position = data['playerPosition']
                obstacles = data['obstacles']

                # Filter obstacles that have already moved towards the player
                obstacles_towards_player = [obs for obs in obstacles if obs['right'] < player_position['right']]

                # Ensure there are obstacles that have moved towards the player
                if obstacles_towards_player:
                    # Find the obstacle with the highest `right` value among those, which will be the closest to the player
                    nearest_obstacle = max(obstacles_towards_player, key=lambda x: x['right'])
                else:
                    # Use a default value if no obstacles have moved towards the player yet
                    nearest_obstacle = {'right': -float('inf'), 'bottom': 0, 'type': 'none'}
                # Encode obstacle type
                obstacle_type = 0 if nearest_obstacle['type'] == 'normal' else 1 if nearest_obstacle['type'] == 'flying' else 2

                # Define state with player's right, bottom positions and nearest obstacle info
                state = [
                    player_position['bottom'],
                    player_position['right'],
                    nearest_obstacle['right'],
                    nearest_obstacle['bottom'],
                    obstacle_type
                ]
                state = np.reshape(state, [1, len(state)])  # Reshape state for the model

                logging.info(f"AI State - Player Bottom: {state[0][0]}, Player Right: {state[0][1]}, Nearest Obstacle Right: {state[0][2]}, Nearest Obstacle Bottom: {state[0][3]}, Obstacle Type: {state[0][4]} ")

                reward = 0.1

                # Check if we have a previous nearest obstacle to compare with
                if prev_nearest_obstacle_right is not None:
                    # Check if the nearest obstacle 'right' value has decreased (AI has passed the obstacle)
                    if nearest_obstacle['right'] < prev_nearest_obstacle_right:
                        reward += 1  # Add a reward for successfully avoiding an obstacle
                        logging.info(f"AI has successfully avoided an obstacle. Reward: {reward}")

                # Update the prev_nearest_obstacle_right for the next iteration
                prev_nearest_obstacle_right = nearest_obstacle['right']

                if state is not None and action is not None:
                    # Remember the previous state, action, reward, and done status
                    agent.remember(state, action, reward, state, False)

                step_count += 1
                if step_count % TRAINING_INTERVAL == 0:
                    # Train the model in a separate thread to avoid blocking
                    executor.submit(agent.replay, batch_size)

                # Decide on an action based on the current state
                action = agent.act(state)
                action_str = "jump" if action == 0 else "crouch" if action == 1 else "nothing"
                await websocket.send(json.dumps({'action': action_str}))  # Send action to the game

        except websockets.ConnectionClosed:
            # Handle connection closure
            break
        except (json.JSONDecodeError, KeyError):
            # Handle potential data issues
            continue


# Start the WebSocket server
start_server = websockets.serve(game_handler, "localhost", 6789)

# Run the server
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
