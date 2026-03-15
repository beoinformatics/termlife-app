#!/usr/bin/env python3
"""Test script to verify state machine transitions."""
import time
import sys

print("Test 1: Prompt for name")
name = input("What's your name? ")
print(f"Hello {name}!")

print("\nTest 2: Press enter to continue")
input("Press enter to exit...")

print("\nGoodbye!")
sys.exit(0)
