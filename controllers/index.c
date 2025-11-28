// 7.Write a c Program to implement AVL trees and its Operations

#include <stdio.h>
#include <stdlib.h>

typedef struct N { int k, h; struct N *l, *r; } N;

int ht(N *n) { return n ? n->h : 0; }
int max(int a, int b) { return (a > b) ? a : b; }

N* new(int k) {
    N* n = malloc(sizeof(N)); n->k = k; n->l = n->r = NULL; n->h = 1;
    return n;
}

N* rRot(N* y) {
    N* x = y->l; N* T2 = x->r;
    x->r = y; y->l = T2;
    y->h = max(ht(y->l), ht(y->r)) + 1;
    x->h = max(ht(x->l), ht(x->r)) + 1;
    return x;
}

N* lRot(N* x) {
    N* y = x->r; N* T2 = y->l;
    y->l = x; x->r = T2;
    x->h = max(ht(x->l), ht(x->r)) + 1;
    y->h = max(ht(y->l), ht(y->r)) + 1;
    return y;
}

int getBal(N* n) { return n ? ht(n->l) - ht(n->r) : 0; }

N* ins(N* n, int k) {
    if (!n) return new(k);
    if (k < n->k) n->l = ins(n->l, k);
    else if (k > n->k) n->r = ins(n->r, k);
    else return n;

    n->h = 1 + max(ht(n->l), ht(n->r));
    int bal = getBal(n);

    if (bal > 1 && k < n->l->k) return rRot(n);
    if (bal < -1 && k > n->r->k) return lRot(n);
    if (bal > 1 && k > n->l->k) { n->l = lRot(n->l); return rRot(n); }
    if (bal < -1 && k < n->r->k) { n->r = rRot(n->r); return lRot(n); }

    return n;
}

void pre(N* n) { if(n) { printf("%d ", n->k); pre(n->l); pre(n->r); } }

int main() {
    N *root = NULL;
    int vals[] = {10, 20, 30, 40, 50, 25};
    int n = sizeof(vals)/sizeof(vals[0]);
    
    for(int i=0; i<n; i++) {
        root = ins(root, vals[i]);
        printf("Inserted %d\n", vals[i]);
    }
    
    printf("Preorder traversal (Root Left Right): ");
    pre(root);
    printf("\n");
    return 0;
}



// Output:
// Inserted 10
// Inserted 20
// Inserted 30
// Inserted 40
// Inserted 50
// Inserted 25
// Preorder traversal (Root Left Right): 30 20 10 25 40 50












