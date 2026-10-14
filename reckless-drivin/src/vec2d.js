// 2D vector helpers (vec2d.h). Vectors are plain {x, y} objects.

export const P2D = (x, y) => ({ x, y });
export const VEC2D_Sum = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const VEC2D_Difference = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const VEC2D_Scale = (v, k) => ({ x: v.x * k, y: v.y * k });
export const VEC2D_CP = (v) => ({ x: v.y, y: -v.x });
export const VEC2D_DotProduct = (a, b) => a.x * b.x + a.y * b.y;
export const VEC2D_CrossProduct = (a, b) => a.x * b.y - a.y * b.x;
export const VEC2D_Value = (v) => Math.sqrt(v.x * v.x + v.y * v.y);

export function VEC2D_Norm(v) {
  const val = VEC2D_Value(v);
  return val ? VEC2D_Scale(v, 1 / val) : { x: 0, y: 0 };
}
