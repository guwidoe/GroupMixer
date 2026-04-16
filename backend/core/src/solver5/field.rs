#[derive(Clone, Copy)]
pub(super) struct FiniteField {
    pub(super) order: usize,
    prime: usize,
    degree: usize,
    modulus: &'static [usize],
}

impl FiniteField {
    pub(super) fn for_order(order: usize) -> Option<Self> {
        match order {
            2 => Some(Self {
                order,
                prime: 2,
                degree: 1,
                modulus: &[1, 0],
            }),
            3 => Some(Self {
                order,
                prime: 3,
                degree: 1,
                modulus: &[1, 0],
            }),
            4 => Some(Self {
                order,
                prime: 2,
                degree: 2,
                modulus: &[1, 1, 1],
            }),
            5 => Some(Self {
                order,
                prime: 5,
                degree: 1,
                modulus: &[1, 0],
            }),
            7 => Some(Self {
                order,
                prime: 7,
                degree: 1,
                modulus: &[1, 0],
            }),
            8 => Some(Self {
                order,
                prime: 2,
                degree: 3,
                modulus: &[1, 1, 0, 1],
            }),
            9 => Some(Self {
                order,
                prime: 3,
                degree: 2,
                modulus: &[1, 0, 1],
            }),
            _ => None,
        }
    }

    pub(super) fn add(self, left: usize, right: usize) -> usize {
        if self.degree == 1 {
            return (left + right) % self.prime;
        }

        let left_digits = self.to_digits(left);
        let right_digits = self.to_digits(right);
        let digits = left_digits
            .iter()
            .zip(right_digits.iter())
            .map(|(l, r)| (l + r) % self.prime)
            .collect::<Vec<_>>();
        self.from_digits(&digits)
    }

    pub(super) fn mul(self, left: usize, right: usize) -> usize {
        if self.degree == 1 {
            return (left * right) % self.prime;
        }

        let left_digits = self.to_digits(left);
        let right_digits = self.to_digits(right);
        let mut product = vec![0usize; self.degree * 2 - 1];
        for (left_idx, left_digit) in left_digits.iter().enumerate() {
            for (right_idx, right_digit) in right_digits.iter().enumerate() {
                product[left_idx + right_idx] =
                    (product[left_idx + right_idx] + (left_digit * right_digit)) % self.prime;
            }
        }

        for degree in (self.degree..product.len()).rev() {
            let coefficient = product[degree] % self.prime;
            if coefficient == 0 {
                continue;
            }
            for offset in 0..self.degree {
                let target = degree - self.degree + offset;
                let reduction = (coefficient * self.modulus[offset]) % self.prime;
                product[target] = (self.prime + product[target] - reduction) % self.prime;
            }
        }

        self.from_digits(&product[..self.degree])
    }

    pub(super) fn pow(self, base: usize, exponent: usize) -> usize {
        let mut result = 1usize;
        let mut factor = base;
        let mut power = exponent;
        while power > 0 {
            if power & 1 == 1 {
                result = self.mul(result, factor);
            }
            factor = self.mul(factor, factor);
            power >>= 1;
        }
        result
    }

    pub(super) fn primitive_element(self) -> Option<usize> {
        if self.order <= 2 {
            return None;
        }
        let target_order = self.order - 1;
        let prime_factors = prime_factors(target_order);
        'candidate: for candidate in 2..self.order {
            for factor in &prime_factors {
                if self.pow(candidate, target_order / factor) == 1 {
                    continue 'candidate;
                }
            }
            return Some(candidate);
        }
        None
    }

    pub(super) fn nonzero_nonone_elements(self) -> Vec<usize> {
        (0..self.order)
            .filter(|value| *value != 0 && *value != 1)
            .collect()
    }

    fn to_digits(self, mut value: usize) -> Vec<usize> {
        let mut digits = vec![0usize; self.degree];
        for digit in &mut digits {
            *digit = value % self.prime;
            value /= self.prime;
        }
        digits
    }

    fn from_digits(self, digits: &[usize]) -> usize {
        let mut value = 0usize;
        let mut factor = 1usize;
        for digit in digits.iter().take(self.degree) {
            value += digit * factor;
            factor *= self.prime;
        }
        value
    }
}

fn prime_factors(mut value: usize) -> Vec<usize> {
    let mut factors = Vec::new();
    let mut divisor = 2usize;
    while divisor * divisor <= value {
        if value % divisor == 0 {
            factors.push(divisor);
            while value % divisor == 0 {
                value /= divisor;
            }
        }
        divisor += if divisor == 2 { 1 } else { 2 };
    }
    if value > 1 {
        factors.push(value);
    }
    factors
}
