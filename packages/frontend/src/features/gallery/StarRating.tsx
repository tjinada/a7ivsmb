import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number;                 // 0..5
  onChange?: (value: number) => void;
  size?: number;                 // px
  readOnly?: boolean;
}

/** 5-star control. Tapping the current value clears it (sets 0). */
export function StarRating({ value, onChange, size = 20, readOnly = false }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.(n === value ? 0 : n);
            }}
            className={readOnly ? 'cursor-default' : 'cursor-pointer transition active:scale-90'}
          >
            <Star
              style={{ width: size, height: size }}
              className={filled ? 'fill-yellow-400 text-yellow-400' : 'fill-transparent text-gray-500'}
            />
          </button>
        );
      })}
    </div>
  );
}