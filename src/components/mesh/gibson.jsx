// GibsonModel.jsx
import React, { useRef, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { MTLLoader, OBJLoader } from 'three-stdlib';

const GibsonModel = ({ scrollProgress }) => {
  const groupRef = useRef();

  // Load the MTL file; note: if textures are missing, the model will render without them.
  const materials = useLoader(MTLLoader, '/mesh/Gibson%20335_Low_Poly.mtl');
  materials.preload();

  // Load the OBJ file and attach the materials
  const object = useLoader(OBJLoader, '/mesh/Gibson%20335_Low_Poly.obj', loader => {
    loader.setMaterials(materials);
  });

  // Set the initial rotation once when the component mounts
  useEffect(() => {
    if (groupRef.current) {
      // Set an initial rotation of 45° (π/4 radians) around the Y-axis
      groupRef.current.rotation.set( Math.PI / 2, - Math.PI / 3, 0 );
    }
  }, []);

  // Animate the model based on scroll progress, adding to the initial rotation
  useFrame(() => {
    if (groupRef.current) {
     groupRef.current.rotation.y = - Math.PI / 3 + scrollProgress * Math.PI * 2;
     groupRef.current.rotation.z = scrollProgress * Math.PI * 2;
    }
  });

  return <primitive object={object} ref={groupRef} />;
};

export default GibsonModel;
