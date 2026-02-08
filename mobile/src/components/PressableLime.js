import React from 'react';
import { Pressable } from 'react-native';

const PressableLime = ({ children, style, onPress, disabled }) => {
  return (
    <Pressable
      android_ripple={{ color: '#32cd32' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        style,
        pressed || hovered ? { backgroundColor: '#84CC16' } : null,
        pressed ? { transform: [{ scale: 0.98 }] } : { transform: [{ scale: 1 }] },
      ]}
    >
      {children}
    </Pressable>
  );
};

export default PressableLime;
